import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import {
  ExamAttempt,
  ExamAttemptDocument,
} from 'src/database/schemas/exam-attempt.schema';
import {
  ExamTest,
  ExamTestDocument,
} from 'src/database/schemas/exam-test.schema';
import {
  Assignment,
  AssignmentDocument,
} from 'src/database/schemas/assignment.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import {
  Submission,
  SubmissionDocument,
} from 'src/database/schemas/submission.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamMode,
  ExamSkill,
  AttemptStatus,
  ExamTestStatus,
  UserRole,
  StudentAssignmentStatus,
  EnrollmentStatus,
  ExamQuestionType,
} from 'src/database/schemas/enums';
import {
  CreateExamAttemptDto,
  SaveAnswersDto,
  SubmitAttemptDto,
} from './dto/exam-attempt.dto';
import { extractObjectId } from 'src/modules/exam-tests/mappers/exam-test.mapper';
import { gradeQuestion } from 'src/common/utils/exam-grading.util';
import { formatVnDateTime } from 'src/common/utils/timezone.util';

@Injectable()
export class ExamAttemptsService {
  constructor(
    @InjectModel(ExamAttempt.name)
    private examAttemptModel: Model<ExamAttemptDocument>,
    @InjectModel(ExamTest.name)
    private examTestModel: Model<ExamTestDocument>,
    @InjectModel(Assignment.name)
    private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(Submission.name)
    private submissionModel: Model<SubmissionDocument>,
    @InjectConnection() private connection: Connection,
    @Optional()
    @InjectModel(Course.name)
    private courseModel?: Model<CourseDocument>,
    @Optional()
    @InjectModel(Enrollment.name)
    private enrollmentModel?: Model<EnrollmentDocument>,
  ) {}

  private async runInTransaction<T>(work: (session?: any) => Promise<T>): Promise<T> {
    if (typeof this.connection?.startSession !== 'function') {
      return await work(undefined);
    }

    const session = await this.connection.startSession();
    try {
      if (typeof session?.withTransaction === 'function') {
        let result!: T;
        await session.withTransaction(async () => {
          result = await work(session);
        });
        return result;
      }
      return await work(session);
    } finally {
      if (typeof session?.endSession === 'function') {
        await session.endSession();
      }
    }
  }

  private async execWithOptionalSession<T>(query: any, session?: any): Promise<T> {
    if (!query) return query;
    const bound = session && typeof query.session === 'function' ? query.session(session) : query;
    return typeof bound?.exec === 'function' ? await bound.exec() : await bound;
  }

  private async assertActorCanAccessAttempt(
    attempt: ExamAttemptDocument,
    test: ExamTestDocument | null,
    actor: UserDocument,
    studentForbiddenMessage: string,
  ): Promise<void> {
    if (actor.role === UserRole.ADMIN) {
      return;
    }

    if (actor.role === UserRole.STUDENT) {
      if (extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
        throw new ForbiddenException(studentForbiddenMessage);
      }
      return;
    }

    if (actor.role === UserRole.TEACHER) {
      const resolvedTest =
        test ?? (await this.examTestModel.findById(attempt.testId).exec());
      if (
        resolvedTest?.createdBy &&
        extractObjectId(resolvedTest.createdBy) === extractObjectId(actor._id)
      ) {
        return;
      }

      if (attempt.assignmentId && this.courseModel) {
        const assignment = await this.assignmentModel.findById(attempt.assignmentId).exec();
        if (assignment?.courseId) {
          const course = await this.courseModel.findById(assignment.courseId).exec();
          if (course && extractObjectId(course.teacherId) === extractObjectId(actor._id)) {
            return;
          }
        }
      }

      if (this.courseModel && this.enrollmentModel) {
        const teacherCourses = await this.courseModel.find({ teacherId: actor._id }).exec();
        const teacherCourseIds = teacherCourses.map((c) => c._id);
        if (teacherCourseIds.length > 0) {
          const activeEnrollment = await this.enrollmentModel
            .findOne({
              courseId: { $in: teacherCourseIds },
              studentId: attempt.studentId,
              status: EnrollmentStatus.ACTIVE,
            })
            .exec();
          if (activeEnrollment) {
            return;
          }
        }
      }

      throw new ForbiddenException('You do not have permission to access this exam attempt');
    }

    throw new ForbiddenException('Access denied');
  }

  private async resolveLinkedAssignment(
    attempt: ExamAttemptDocument,
    session?: any,
  ): Promise<AssignmentDocument | null> {
    if (attempt.assignmentId) {
      return this.execWithOptionalSession<AssignmentDocument | null>(
        this.assignmentModel.findById(attempt.assignmentId),
        session,
      );
    }
    if (attempt.studentAssignmentId) {
      const sa = await this.execWithOptionalSession<StudentAssignmentDocument | null>(
        this.studentAssignmentModel.findById(attempt.studentAssignmentId),
        session,
      );
      if (sa?.assignmentId) {
        return this.execWithOptionalSession<AssignmentDocument | null>(
          this.assignmentModel.findById(sa.assignmentId),
          session,
        );
      }
    }
    return null;
  }

  async createAttempt(dto: CreateExamAttemptDto, student: UserDocument) {
    let resolvedTestId = dto.testId;

    if (!resolvedTestId && dto.studentAssignmentId && Types.ObjectId.isValid(dto.studentAssignmentId)) {
      const sa = await this.studentAssignmentModel.findById(dto.studentAssignmentId).exec();
      if (sa) {
        const asg = await this.assignmentModel.findById(sa.assignmentId).exec();
        if (asg) {
          resolvedTestId = extractObjectId(asg.examTestId || asg.exerciseId);
        }
      }
    } else if (!resolvedTestId && dto.assignmentId && Types.ObjectId.isValid(dto.assignmentId)) {
      const asg = await this.assignmentModel.findById(dto.assignmentId).exec();
      if (asg) {
        resolvedTestId = extractObjectId(asg.examTestId || asg.exerciseId);
      }
    }

    if (!resolvedTestId || !Types.ObjectId.isValid(resolvedTestId)) {
      throw new NotFoundException('Exam test not found');
    }

    // Check idempotency scoped strictly to the requesting student (prevents cross-student IDOR)
    if (dto.idempotencyKey) {
      const existingKeyAttempt = await this.examAttemptModel
        .findOne({ idempotencyKey: dto.idempotencyKey, studentId: student._id })
        .exec();
      if (existingKeyAttempt) {
        const existingTest = await this.examTestModel.findById(existingKeyAttempt.testId).exec();
        return this.formatAttemptResponse(existingKeyAttempt, existingTest);
      }
    }

    const test = await this.examTestModel.findById(resolvedTestId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }

    if (test.status !== ExamTestStatus.PUBLISHED && student.role === UserRole.STUDENT) {
      throw new ForbiddenException('This exam test is not available for practice');
    }

    // Verify mode
    if (test.allowedModes && !test.allowedModes.includes(dto.mode)) {
      throw new BadRequestException({
        code: 'INVALID_EXAM_SCOPE',
        message: `Mode ${dto.mode} is not allowed for this test`,
      });
    }

    // Verify scope: PART vs FULL
    let selectedPart: any = null;
    if (dto.mode === ExamMode.PART) {
      if (!dto.partId) {
        throw new BadRequestException({
          code: 'INVALID_EXAM_SCOPE',
          message: 'partId is required when mode is PART',
        });
      }
      selectedPart = test.parts.find((p: any) => extractObjectId(p._id) === dto.partId);
      if (!selectedPart) {
        throw new BadRequestException({
          code: 'INVALID_EXAM_SCOPE',
          message: 'partId does not exist in this test',
        });
      }
    } else if (dto.mode === ExamMode.FULL) {
      if (dto.partId) {
        throw new BadRequestException({
          code: 'INVALID_EXAM_SCOPE',
          message: 'partId must be null or omitted when mode is FULL',
        });
      }
    }

    // Verify assignment constraints if homework
    let linkedAssignment: AssignmentDocument | null = null;
    let linkedStudentAssignment: StudentAssignmentDocument | null = null;

    if (dto.studentAssignmentId) {
      if (!Types.ObjectId.isValid(dto.studentAssignmentId)) {
        throw new BadRequestException('Invalid studentAssignmentId');
      }
      linkedStudentAssignment = await this.studentAssignmentModel
        .findById(dto.studentAssignmentId)
        .exec();

      if (!linkedStudentAssignment) {
        throw new NotFoundException('Student assignment not found');
      }
      if (extractObjectId(linkedStudentAssignment.studentId) !== extractObjectId(student._id)) {
        throw new ForbiddenException('You do not own this student assignment');
      }

      linkedAssignment = await this.assignmentModel
        .findById(linkedStudentAssignment.assignmentId)
        .exec();
    } else if (dto.assignmentId) {
      if (!Types.ObjectId.isValid(dto.assignmentId)) {
        throw new BadRequestException('Invalid assignmentId');
      }
      linkedAssignment = await this.assignmentModel.findById(dto.assignmentId).exec();
      if (!linkedAssignment) {
        throw new NotFoundException('Assignment not found');
      }
      linkedStudentAssignment = await this.studentAssignmentModel
        .findOne({
          assignmentId: linkedAssignment._id,
          studentId: student._id,
        })
        .exec();
    }

    if (linkedAssignment) {
      const now = new Date();
      if (
        linkedAssignment.openAt &&
        now.getTime() < new Date(linkedAssignment.openAt).getTime()
      ) {
        throw new ForbiddenException({
          statusCode: 403,
          error: 'Forbidden',
          code: 'ASSIGNMENT_NOT_YET_AVAILABLE',
          message: `Assignment is scheduled and not yet available until ${formatVnDateTime(linkedAssignment.openAt)}`,
          availableAt: linkedAssignment.openAt,
          availableAtVn: formatVnDateTime(linkedAssignment.openAt),
        });
      }
      const effectiveDeadline = linkedStudentAssignment?.effectiveDeadlineAt || linkedAssignment.deadlineAt;
      if (effectiveDeadline && now.getTime() >= new Date(effectiveDeadline).getTime()) {
        throw new BadRequestException({
          statusCode: 400,
          error: 'BadRequest',
          code: 'ASSIGNMENT_EXPIRED',
          message: 'Assignment deadline has passed',
          deadlineAt: effectiveDeadline,
          deadlineAtVn: formatVnDateTime(effectiveDeadline),
        });
      }

      if (linkedAssignment.requiredScope && linkedAssignment.requiredScope !== dto.mode) {
        throw new ForbiddenException({
          code: 'ASSIGNMENT_SCOPE_LOCKED',
          message: `This assignment requires ${linkedAssignment.requiredScope} mode`,
        });
      }
      if (
        dto.mode === ExamMode.PART &&
        linkedAssignment.requiredPartId &&
        dto.partId !== linkedAssignment.requiredPartId
      ) {
        throw new ForbiddenException({
          code: 'ASSIGNMENT_SCOPE_LOCKED',
          message: `This assignment requires part ${linkedAssignment.requiredPartId}`,
        });
      }

      if (linkedStudentAssignment) {
        const attemptsCount = linkedStudentAssignment.attemptsCount ?? 0;
        if (
          !linkedAssignment.allowRetake &&
          (attemptsCount >= 1 ||
            linkedStudentAssignment.status === StudentAssignmentStatus.SUBMITTED ||
            linkedStudentAssignment.status === StudentAssignmentStatus.PASSED)
        ) {
          throw new BadRequestException('Retakes are not allowed for this assignment');
        }
        if (linkedAssignment.maxAttempts && attemptsCount >= linkedAssignment.maxAttempts) {
          throw new BadRequestException('Maximum attempts reached for this assignment');
        }
      }
    }

    // Check concurrency: if student already has an IN_PROGRESS attempt for this exact scope
    const activeFilter: Record<string, any> = {
      studentId: student._id,
      testId: test._id,
      mode: dto.mode,
      partId: dto.mode === ExamMode.PART ? dto.partId : null,
      status: AttemptStatus.IN_PROGRESS,
    };

    const existingActive = await this.examAttemptModel.findOne(activeFilter).exec();
    if (existingActive) {
      // If expiresAt has passed, finalize (auto-submit) it so saved work isn't dropped
      if (existingActive.expiresAt && Date.now() > new Date(existingActive.expiresAt).getTime()) {
        await this.finalizeAttemptSubmission({
          attempt: existingActive,
          test,
          expectedStatus: AttemptStatus.IN_PROGRESS,
          finalStatus: AttemptStatus.AUTO_SUBMITTED,
          now: new Date(),
        });
        if (linkedAssignment && linkedStudentAssignment) {
          const refreshedSa = await this.studentAssignmentModel
            .findById(linkedStudentAssignment._id)
            .exec();
          const refreshedCount =
            refreshedSa?.attemptsCount ?? linkedStudentAssignment.attemptsCount ?? 0;
          if (
            !linkedAssignment.allowRetake &&
            (refreshedCount >= 1 ||
              refreshedSa?.status === StudentAssignmentStatus.SUBMITTED ||
              refreshedSa?.status === StudentAssignmentStatus.PASSED)
          ) {
            throw new BadRequestException('Retakes are not allowed for this assignment');
          }
          if (linkedAssignment.maxAttempts && refreshedCount >= linkedAssignment.maxAttempts) {
            throw new BadRequestException('Maximum attempts reached for this assignment');
          }
        }
      } else {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'ATTEMPT_ALREADY_IN_PROGRESS',
          message: 'An active exam attempt is already in progress. Please resume or submit it.',
          attemptId: extractObjectId(existingActive._id),
        });
      }
    }

    // Determine scope question numbers
    const scopeQuestionIds: string[] = [];
    if (dto.mode === ExamMode.PART && selectedPart) {
      for (const group of selectedPart.questionGroups || []) {
        for (const q of group.questions || []) {
          scopeQuestionIds.push(q.number.toString());
        }
      }
    } else {
      // FULL: all questions across all parts
      for (const part of test.parts || []) {
        for (const group of part.questionGroups || []) {
          for (const q of group.questions || []) {
            scopeQuestionIds.push(q.number.toString());
          }
        }
      }
    }

    // Calculate duration
    let durationSeconds = 3600;
    if (linkedAssignment?.durationSecondsOverride) {
      durationSeconds = linkedAssignment.durationSecondsOverride;
    } else if (dto.mode === ExamMode.PART && selectedPart?.durationSeconds) {
      durationSeconds = selectedPart.durationSeconds;
    } else if (test.fullDurationSeconds) {
      durationSeconds = test.fullDurationSeconds;
    } else if (dto.mode === ExamMode.PART) {
      durationSeconds = test.skill === ExamSkill.READING ? 1200 : 600;
    } else {
      durationSeconds = test.skill === ExamSkill.READING ? 3600 : 1800;
    }

    const startedAt = new Date();
    let expiresAt = new Date(startedAt.getTime() + durationSeconds * 1000);
    const effectiveDeadline = linkedStudentAssignment?.effectiveDeadlineAt || linkedAssignment?.deadlineAt;
    if (effectiveDeadline) {
      const deadline = new Date(effectiveDeadline);
      if (expiresAt.getTime() > deadline.getTime()) {
        expiresAt = deadline;
      }
    }

    const attempt = new this.examAttemptModel({
      studentId: student._id,
      testId: test._id,
      exerciseVersion: test.version,
      assignmentId: linkedAssignment?._id,
      studentAssignmentId: linkedStudentAssignment?._id,
      skill: test.skill,
      mode: dto.mode,
      partId: dto.mode === ExamMode.PART ? dto.partId : null,
      status: AttemptStatus.IN_PROGRESS,
      startedAt,
      expiresAt,
      answersRevision: 0,
      scopeQuestionIds,
      savedAnswers: new Map(),
      idempotencyKey: dto.idempotencyKey,
    });

    try {
      const saved = await attempt.save();
      return this.formatAttemptResponse(saved, test);
    } catch (err: any) {
      if (err?.code === 11000) {
        if (dto.idempotencyKey) {
          const existingByKey = await this.examAttemptModel
            .findOne({ idempotencyKey: dto.idempotencyKey, studentId: student._id })
            .exec();
          if (existingByKey) {
            return this.formatAttemptResponse(existingByKey, test);
          }
          const isKeyCollision =
            Boolean(err?.keyPattern?.idempotencyKey) ||
            String(err?.message || '').includes('idempotencyKey');
          if (isKeyCollision) {
            throw new ConflictException('Idempotency key conflict');
          }
        }
        const duplicateActive = await this.examAttemptModel.findOne(activeFilter).exec();
        if (duplicateActive) {
          return this.formatAttemptResponse(duplicateActive, test);
        }
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'ATTEMPT_ALREADY_IN_PROGRESS',
          message: 'An active exam attempt is already in progress. Please resume or submit it.',
        });
      }
      throw err;
    }
  }

  async getAttempt(attemptId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    await this.assertActorCanAccessAttempt(
      attempt,
      test,
      actor,
      'You cannot access another student’s attempt',
    );

    return this.formatAttemptResponse(attempt, test);
  }

  async saveAnswers(attemptId: string, dto: SaveAnswersDto, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You cannot modify another student’s attempt');
    }

    if (attempt.status !== AttemptStatus.IN_PROGRESS) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'ATTEMPT_ALREADY_SUBMITTED',
        message: 'This attempt is no longer in progress',
      });
    }

    const now = new Date();

    // Check expiry: auto-submit and grade existing savedAnswers so student work is never dropped
    if (attempt.expiresAt && now.getTime() > new Date(attempt.expiresAt).getTime()) {
      const test = await this.examTestModel.findById(attempt.testId).exec();
      if (test) {
        await this.finalizeAttemptSubmission({
          attempt,
          test,
          expectedStatus: AttemptStatus.IN_PROGRESS,
          finalStatus: AttemptStatus.AUTO_SUBMITTED,
          now,
        });
      } else {
        await this.examAttemptModel
          .findOneAndUpdate(
            { _id: attempt._id, status: AttemptStatus.IN_PROGRESS },
            { $set: { status: AttemptStatus.AUTO_SUBMITTED, submittedAt: now } },
            { new: true },
          )
          .exec();
      }
      throw new BadRequestException({
        statusCode: 400,
        error: 'Bad Request',
        code: 'ATTEMPT_EXPIRED',
        message: 'Exam time has expired',
      });
    }

    // Optimistic concurrency check
    if (dto.baseRevision !== attempt.answersRevision) {
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'ANSWERS_REVISION_CONFLICT',
        message: 'Answers revision conflict. Please refetch and merge.',
        currentRevision: attempt.answersRevision,
      });
    }

    // Merge answers into a fresh Map copy (only accept question numbers in scope)
    const validScope = new Set(attempt.scopeQuestionIds || []);
    const currentMap =
      attempt.savedAnswers instanceof Map
        ? new Map(attempt.savedAnswers)
        : new Map(Object.entries(attempt.savedAnswers || {}));

    const answersList: { questionId: string; value: any }[] = Array.isArray(dto.answers)
      ? dto.answers
      : Object.entries(dto.answers || {}).map(([questionId, value]) => ({ questionId, value }));

    for (const ans of answersList) {
      if (ans && ans.questionId && validScope.has(ans.questionId.toString())) {
        currentMap.set(ans.questionId.toString(), ans.value);
      }
    }

    const updateSet: Record<string, any> = {
      savedAnswers: currentMap,
      lastSavedAt: now,
    };
    if (Array.isArray(dto.flaggedQuestionIds)) {
      updateSet.flaggedQuestionIds = dto.flaggedQuestionIds;
    }

    const updated = await this.examAttemptModel
      .findOneAndUpdate(
        {
          _id: attempt._id,
          status: AttemptStatus.IN_PROGRESS,
          answersRevision: dto.baseRevision,
        },
        {
          $set: updateSet,
          $inc: { answersRevision: 1 },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      const latest = await this.examAttemptModel.findById(attemptId).exec();
      if (latest && latest.status !== AttemptStatus.IN_PROGRESS) {
        throw new ConflictException({
          statusCode: 409,
          error: 'Conflict',
          code: 'ATTEMPT_ALREADY_SUBMITTED',
          message: 'This attempt is no longer in progress',
        });
      }
      throw new ConflictException({
        statusCode: 409,
        error: 'Conflict',
        code: 'ANSWERS_REVISION_CONFLICT',
        message: 'Answers revision conflict. Please refetch and merge.',
        currentRevision: latest?.answersRevision ?? attempt.answersRevision,
      });
    }

    const savedMap =
      updated.savedAnswers instanceof Map
        ? updated.savedAnswers
        : new Map(Object.entries(updated.savedAnswers || {}));

    const remainingSeconds = updated.expiresAt
      ? Math.max(0, Math.floor((new Date(updated.expiresAt).getTime() - Date.now()) / 1000))
      : 0;
    const answeredCount = Array.from(savedMap.values()).filter((v) =>
      Array.isArray(v) ? v.length > 0 : String(v ?? '').trim().length > 0,
    ).length;

    return {
      attemptId: extractObjectId(updated._id),
      answersRevision: updated.answersRevision,
      revision: updated.answersRevision,
      savedQuestionIds: Array.from(savedMap.keys()),
      lastSavedAt: updated.lastSavedAt,
      savedAt: updated.lastSavedAt ? updated.lastSavedAt.toISOString() : now.toISOString(),
      serverTime: new Date().toISOString(),
      remainingSeconds,
      answeredCount,
    };
  }

  private async finalizeAttemptSubmission(options: {
    attempt: ExamAttemptDocument;
    test: ExamTestDocument;
    expectedStatus: AttemptStatus;
    finalStatus: AttemptStatus;
    mergeAnswers?: any;
    mergeFlaggedQuestionIds?: string[];
    now?: Date;
  }) {
    const {
      attempt,
      test,
      expectedStatus,
      finalStatus,
      mergeAnswers,
      mergeFlaggedQuestionIds,
      now = new Date(),
    } = options;

    const scopeIds = attempt.scopeQuestionIds || [];
    const validScope = new Set(scopeIds);
    const workingAnswers =
      attempt.savedAnswers instanceof Map
        ? new Map(attempt.savedAnswers)
        : new Map(Object.entries(attempt.savedAnswers || {}));

    if (mergeAnswers) {
      const answersList = Array.isArray(mergeAnswers)
        ? mergeAnswers
        : Object.entries(mergeAnswers || {}).map(([questionId, value]) => ({ questionId, value }));

      for (const ans of answersList) {
        if (ans && ans.questionId !== undefined) {
          const qKey = ans.questionId.toString();
          if (validScope.size === 0 || validScope.has(qKey)) {
            workingAnswers.set(qKey, ans.value);
          }
        }
      }
    }

    // Collect questions in attempt scope
    const questionMap = new Map<string, any>();
    for (const part of test.parts || []) {
      for (const group of part.questionGroups || []) {
        for (const q of group.questions || []) {
          questionMap.set(q.number.toString(), {
            ...q,
            groupType: group.type,
            grading: q.grading,
          });
        }
      }
    }

    let earnedPoints = 0;
    let totalPoints = 0;
    let correctCount = 0;
    const questionCount = scopeIds.length;
    const gradedAnswers: any[] = [];

    for (const qNum of scopeIds) {
      const q = questionMap.get(qNum);
      const qPoints = q?.points ?? 1;
      totalPoints += qPoints;

      const studentVal = workingAnswers.get(qNum);
      const gradeRes = gradeQuestion(q?.type || q?.groupType, studentVal, q?.grading, qPoints);

      if (gradeRes.isCorrect) {
        correctCount++;
        earnedPoints += gradeRes.awardedPoints;
      }

      gradedAnswers.push({
        questionId: qNum,
        value:
          studentVal !== null && typeof studentVal === 'object'
            ? JSON.stringify(studentVal)
            : String(studentVal ?? ''),
        awardedPoints: gradeRes.awardedPoints,
        isCorrect: gradeRes.isCorrect,
      });
    }

    const linkedAsn = await this.resolveLinkedAssignment(attempt);
    const rawScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passScore = linkedAsn?.targetScorePercent ?? test.passScore ?? 70;
    const isPassed = rawScore >= passScore;
    const scorePercent = Math.round(rawScore * 100) / 100;

    const { updatedAttempt, submissionDoc, lostRace } = await this.runInTransaction<{
      updatedAttempt: ExamAttemptDocument | null;
      submissionDoc: SubmissionDocument | null;
      lostRace: boolean;
    }>(async (session) => {
      const attemptFilter: Record<string, any> = {
        _id: attempt._id,
        status: expectedStatus,
      };
      if (expectedStatus === AttemptStatus.AUTO_SUBMITTED) {
        attemptFilter.$or = [{ submittedAt: null }, { submittedAt: { $exists: false } }];
      }

      const updateSet: Record<string, any> = {
        status: finalStatus,
        submittedAt: now,
        savedAnswers: workingAnswers,
        scorePercent,
        passed: isPassed,
      };
      if (Array.isArray(mergeFlaggedQuestionIds)) {
        updateSet.flaggedQuestionIds = mergeFlaggedQuestionIds;
      }

      const updated = await this.execWithOptionalSession<ExamAttemptDocument | null>(
        this.examAttemptModel.findOneAndUpdate(
          attemptFilter,
          { $set: updateSet },
          session ? { new: true, session } : { new: true },
        ),
        session,
      );

      if (!updated) {
        return { updatedAttempt: null, submissionDoc: null, lostRace: true };
      }

      let createdSubmission: SubmissionDocument | null = null;
      if (attempt.studentAssignmentId) {
        const sa = await this.execWithOptionalSession<StudentAssignmentDocument | null>(
          this.studentAssignmentModel.findById(attempt.studentAssignmentId),
          session,
        );

        if (sa) {
          const countQuery = this.submissionModel.countDocuments({
            studentAssignmentId: sa._id,
          });
          const existingCount = await this.execWithOptionalSession<number>(countQuery, session);

          createdSubmission = new this.submissionModel({
            studentAssignmentId: sa._id,
            assignmentId: attempt.assignmentId || sa.assignmentId,
            studentId: attempt.studentId,
            attemptNo: existingCount + 1,
            answers: gradedAnswers,
            scorePercent,
            correctCount,
            totalQuestions: questionCount,
            isPassed,
            submittedAt: now,
            exerciseVersion: attempt.exerciseVersion,
            examAttemptId: attempt._id,
            mode: attempt.mode,
            partId: attempt.partId,
            scopeQuestionIds: attempt.scopeQuestionIds,
            earnedPoints,
            totalPoints,
          });

          await createdSubmission.save(session ? { session } : undefined);

          const isTargetAchieved = rawScore >= passScore;
          const nextTargetAchieved = Boolean(sa.isTargetAchieved) || isTargetAchieved;

          sa.lastSubmittedAt = now;
          sa.attemptsCount = (sa.attemptsCount || 0) + 1;
          sa.bestScore = Math.max(sa.bestScore || 0, scorePercent);
          sa.isTargetAchieved = nextTargetAchieved;

          if (sa.status === StudentAssignmentStatus.PASSED || isPassed || nextTargetAchieved) {
            sa.status = StudentAssignmentStatus.PASSED;
            if (!sa.passedAt) sa.passedAt = now;
          } else {
            sa.status = StudentAssignmentStatus.SUBMITTED;
          }

          await sa.save(session ? { session } : undefined);
        }
      }

      return { updatedAttempt: updated, submissionDoc: createdSubmission, lostRace: false };
    });

    if (lostRace) {
      const latestAttempt = await this.examAttemptModel.findById(attempt._id).exec();
      if (!latestAttempt) {
        throw new NotFoundException('Exam attempt not found');
      }
      if (latestAttempt.status === AttemptStatus.EXPIRED) {
        throw new BadRequestException('Attempt has expired and cannot be submitted');
      }
      let existingSubmissionId: string | undefined;
      if (latestAttempt.studentAssignmentId && typeof this.submissionModel.findOne === 'function') {
        const subQuery = this.submissionModel.findOne({ examAttemptId: latestAttempt._id });
        const existingSub = await this.execWithOptionalSession<SubmissionDocument | null>(subQuery);
        if (existingSub) {
          existingSubmissionId = extractObjectId(existingSub._id);
        }
      }
      return this.buildResultPayload(latestAttempt, test, existingSubmissionId);
    }

    // Keep caller's local attempt reference in sync
    attempt.status = finalStatus;
    attempt.submittedAt = now;
    attempt.savedAnswers = workingAnswers;
    attempt.scorePercent = scorePercent;
    attempt.passed = isPassed;
    if (Array.isArray(mergeFlaggedQuestionIds)) {
      attempt.flaggedQuestionIds = mergeFlaggedQuestionIds;
    }

    return this.buildResultPayload(
      updatedAttempt || attempt,
      test,
      submissionDoc ? extractObjectId(submissionDoc._id) : undefined,
      {
        earnedPoints,
        totalPoints,
        scorePercent,
        correctCount,
        questionCount,
        isPassed,
        passScore,
        submittedAt: now,
      },
    );
  }

  async submitAttempt(attemptId: string, dto: SubmitAttemptDto, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You cannot submit another student’s attempt');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    if (!test) {
      throw new NotFoundException('Associated exam test not found');
    }

    if (attempt.status === AttemptStatus.EXPIRED) {
      throw new BadRequestException('Attempt has expired and cannot be submitted');
    }

    // Return idempotently ONLY if the submission was already finalized
    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.AUTO_SUBMITTED) {
      let existingSubmission: SubmissionDocument | null = null;
      if (attempt.studentAssignmentId && typeof this.submissionModel.findOne === 'function') {
        existingSubmission = await this.execWithOptionalSession<SubmissionDocument | null>(
          this.submissionModel.findOne({ examAttemptId: attempt._id }),
        );
      }
      const isFinalized =
        !attempt.studentAssignmentId ||
        Boolean(existingSubmission) ||
        attempt.submittedAt != null ||
        attempt.scorePercent !== undefined;

      if (isFinalized) {
        return this.buildResultPayload(
          attempt,
          test,
          existingSubmission ? extractObjectId(existingSubmission._id) : undefined,
        );
      }

      // Recover an unfinalized AUTO_SUBMITTED attempt without accepting late dto.answers
      return this.finalizeAttemptSubmission({
        attempt,
        test,
        expectedStatus: AttemptStatus.AUTO_SUBMITTED,
        finalStatus: AttemptStatus.AUTO_SUBMITTED,
      });
    }

    const now = new Date();
    const isExpired = Boolean(
      attempt.expiresAt && now.getTime() > new Date(attempt.expiresAt).getTime(),
    );

    return this.finalizeAttemptSubmission({
      attempt,
      test,
      expectedStatus: AttemptStatus.IN_PROGRESS,
      finalStatus: isExpired ? AttemptStatus.AUTO_SUBMITTED : AttemptStatus.SUBMITTED,
      mergeAnswers: isExpired ? undefined : dto.answers,
      mergeFlaggedQuestionIds: isExpired ? undefined : dto.flaggedQuestionIds,
      now,
    });
  }

  async getResult(attemptId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    await this.assertActorCanAccessAttempt(
      attempt,
      test,
      actor,
      'You cannot access another student’s result',
    );

    if (attempt.status === AttemptStatus.IN_PROGRESS) {
      throw new BadRequestException('Result is not available while attempt is in progress');
    }

    if (!test) {
      throw new NotFoundException('Associated exam test not found');
    }

    let existingSubmissionId: string | undefined;
    if (attempt.studentAssignmentId && typeof this.submissionModel.findOne === 'function') {
      const existingSub = await this.execWithOptionalSession<SubmissionDocument | null>(
        this.submissionModel.findOne({ examAttemptId: attempt._id }),
      );
      if (existingSub) {
        existingSubmissionId = extractObjectId(existingSub._id);
      }
    }

    return this.buildResultPayload(attempt, test, existingSubmissionId);
  }

  async getReview(attemptId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    await this.assertActorCanAccessAttempt(
      attempt,
      test,
      actor,
      'You cannot access another student’s review',
    );

    if (!test) {
      throw new NotFoundException('Associated exam test not found');
    }

    // Prevent viewing review if attempt is still in progress
    if (actor.role === UserRole.STUDENT && attempt.status === AttemptStatus.IN_PROGRESS) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'ATTEMPT_IN_PROGRESS',
        message: 'Bạn cần nộp bài thi trước khi xem đáp án chi tiết.',
      });
    }

    // Grade and check PASS status
    const result = await this.buildResultPayload(attempt, test);

    // Assemble review questions
    const questionMap = new Map<string, any>();
    for (const part of test.parts || []) {
      for (const group of part.questionGroups || []) {
        for (const q of group.questions || []) {
          questionMap.set(q.number.toString(), {
            number: q.number,
            prompt: q.prompt,
            type: q.type || group.type,
            points: q.points ?? 1,
            options: q.options,
            grading: q.grading,
            partId: extractObjectId((part as any)._id),
          });
        }
      }
    }

    const studentAnswers = attempt.savedAnswers instanceof Map
      ? attempt.savedAnswers
      : new Map(Object.entries(attempt.savedAnswers || {}));

    const reviewQuestions = attempt.scopeQuestionIds.map((qNum) => {
      const q = questionMap.get(qNum);
      const studentVal = studentAnswers.get(qNum);
      const gradeRes = gradeQuestion(q?.type, studentVal, q?.grading, q?.points ?? 1);

      return {
        questionId: qNum,
        number: q?.number ?? parseInt(qNum, 10),
        prompt: q?.prompt,
        type: q?.type,
        options: q?.options,
        partId: q?.partId,
        studentAnswer: studentVal ?? null,
        correctAnswer: q?.grading?.acceptedKeys || [],
        explanation: 'Đáp án chính xác theo quy chuẩn chấm điểm IELTS.',
        isCorrect: gradeRes.isCorrect,
        points: q?.points ?? 1,
        awardedPoints: gradeRes.awardedPoints,
      };
    });

    return {
      attemptId: extractObjectId(attempt._id),
      testId: extractObjectId(test._id),
      testTitle: test.title,
      skill: attempt.skill,
      mode: attempt.mode,
      partId: attempt.partId,
      scorePercent: result.scorePercent,
      passed: result.passed,
      answerReviewAvailable: true,
      questions: reviewQuestions,
      items: reviewQuestions,
    };
  }

  private async buildResultPayload(
    attempt: ExamAttemptDocument,
    test: ExamTestDocument,
    submissionId?: string,
    preCalculated?: any,
  ) {
    let earnedPoints = preCalculated?.earnedPoints;
    let totalPoints = preCalculated?.totalPoints;
    let correctCount = preCalculated?.correctCount;
    let isPassed = preCalculated?.isPassed;
    let scorePercent = preCalculated?.scorePercent;
    let passScore = preCalculated?.passScore;
    if (passScore === undefined) {
      const linkedAsn = await this.resolveLinkedAssignment(attempt);
      passScore = linkedAsn?.targetScorePercent ?? test.passScore ?? 70;
    }

    if (earnedPoints === undefined) {
      // Calculate
      const questionMap = new Map<string, any>();
      for (const part of test.parts || []) {
        for (const group of part.questionGroups || []) {
          for (const q of group.questions || []) {
            questionMap.set(q.number.toString(), {
              type: q.type || group.type,
              points: q.points ?? 1,
              grading: q.grading,
            });
          }
        }
      }

      const studentAnswers = attempt.savedAnswers instanceof Map
        ? attempt.savedAnswers
        : new Map(Object.entries(attempt.savedAnswers || {}));

      earnedPoints = 0;
      totalPoints = 0;
      correctCount = 0;

      for (const qNum of attempt.scopeQuestionIds || []) {
        const q = questionMap.get(qNum);
        const qPoints = q?.points ?? 1;
        totalPoints += qPoints;

        const val = studentAnswers.get(qNum);
        const gradeRes = gradeQuestion(q?.type, val, q?.grading, qPoints);
        if (gradeRes.isCorrect) {
          correctCount++;
          earnedPoints += gradeRes.awardedPoints;
        }
      }

      const rawScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
      isPassed = attempt.passed ?? rawScore >= passScore;
      scorePercent = attempt.scorePercent ?? Math.round(rawScore * 100) / 100;
    }

    // Translation unlock rules
    let unlockedPassageIds: string[] = [];
    const isReading = attempt.skill === ExamSkill.READING;

    if (isReading && isPassed) {
      if (attempt.mode === ExamMode.PART && attempt.partId) {
        unlockedPassageIds = [attempt.partId];
      } else if (attempt.mode === ExamMode.FULL) {
        unlockedPassageIds = (test.parts || []).map((p: any) => extractObjectId((p as any)._id));
      }
    }

    // Compute partBreakdown and questionTypeBreakdown
    const partStatsMap = new Map<string, { partId: string; partNumber: number; title: string; correctCount: number; totalCount: number }>();
    const typeStatsMap = new Map<string, { correctCount: number; totalCount: number }>();

    for (const part of test.parts || []) {
      const partId = extractObjectId((part as any)._id);
      if (attempt.mode === ExamMode.PART && attempt.partId && partId !== attempt.partId) {
        continue;
      }
      partStatsMap.set(partId, {
        partId,
        partNumber: part.ordinal || 1,
        title: part.title,
        correctCount: 0,
        totalCount: 0,
      });
    }

    const studentAnswersMap = attempt.savedAnswers instanceof Map
      ? attempt.savedAnswers
      : new Map(Object.entries(attempt.savedAnswers || {}));

    for (const part of test.parts || []) {
      const partId = extractObjectId((part as any)._id);
      const partEntry = partStatsMap.get(partId);
      for (const group of part.questionGroups || []) {
        for (const q of group.questions || []) {
          const qNum = q.number.toString();
          if (attempt.scopeQuestionIds.includes(qNum)) {
            const qType = q.type || group.type || ExamQuestionType.MULTIPLE_CHOICE_SINGLE;
            if (!typeStatsMap.has(qType)) {
              typeStatsMap.set(qType, { correctCount: 0, totalCount: 0 });
            }
            const typeEntry = typeStatsMap.get(qType)!;
            typeEntry.totalCount++;
            if (partEntry) partEntry.totalCount++;

            const val = studentAnswersMap.get(qNum);
            const gradeRes = gradeQuestion(qType, val, q.grading, q.points ?? 1);
            if (gradeRes.isCorrect) {
              typeEntry.correctCount++;
              if (partEntry) partEntry.correctCount++;
            }
          }
        }
      }
    }

    const partBreakdown = Array.from(partStatsMap.values()).map((p) => ({
      partId: p.partId,
      partNumber: p.partNumber,
      title: p.title,
      correctCount: p.correctCount,
      totalCount: p.totalCount,
      percentage: p.totalCount > 0 ? Math.round((p.correctCount / p.totalCount) * 100) : 0,
    }));

    const questionTypeBreakdown = Array.from(typeStatsMap.entries()).map(([qType, stats]) => ({
      questionType: qType,
      label: qType,
      correctCount: stats.correctCount,
      totalCount: stats.totalCount,
    }));

    let ieltsBandEstimate: number | null = null;
    if (scorePercent >= 90) ieltsBandEstimate = 9.0;
    else if (scorePercent >= 82) ieltsBandEstimate = 8.5;
    else if (scorePercent >= 75) ieltsBandEstimate = 8.0;
    else if (scorePercent >= 68) ieltsBandEstimate = 7.5;
    else if (scorePercent >= 60) ieltsBandEstimate = 7.0;
    else if (scorePercent >= 52) ieltsBandEstimate = 6.5;
    else if (scorePercent >= 45) ieltsBandEstimate = 6.0;
    else if (scorePercent >= 38) ieltsBandEstimate = 5.5;
    else if (scorePercent >= 30) ieltsBandEstimate = 5.0;
    else ieltsBandEstimate = 4.5;

    const attemptId = extractObjectId(attempt._id);
    const testId = extractObjectId(test._id);

    const submittedAtDate = attempt.submittedAt || new Date();
    const startedAtDate = attempt.startedAt || new Date();
    const timeSpentSeconds = Math.max(
      0,
      Math.round((submittedAtDate.getTime() - startedAtDate.getTime()) / 1000),
    );

    return {
      attemptId,
      id: attemptId,
      testId,
      testTitle: test.title || 'IELTS Exam Test',
      submissionId: submissionId || null,
      studentAssignmentId: attempt.studentAssignmentId ? extractObjectId(attempt.studentAssignmentId) : null,
      status: attempt.status === AttemptStatus.AUTO_SUBMITTED ? 'SUBMITTED' : attempt.status,
      skill: attempt.skill,
      mode: attempt.mode,
      partId: attempt.partId ? extractObjectId(attempt.partId) : null,
      earnedPoints,
      totalPoints,
      scorePercent,
      passScore,
      passThresholdPercent: passScore,
      passed: Boolean(isPassed),
      correctCount,
      questionCount: attempt.scopeQuestionIds.length,
      totalQuestions: attempt.scopeQuestionIds.length,
      ieltsBandEstimate,
      answerReviewAvailable: true,
      answerReviewLockedReason: null,
      translationEligible: isReading && Boolean(isPassed),
      translationEligibilityHint: isReading && isPassed ? 'Đã mở khóa dịch bài đọc tiếng Việt' : null,
      translation: {
        available: isReading && Boolean(isPassed),
        unlockedPassageIds,
      },
      partBreakdown,
      questionTypeBreakdown,
      timeSpentSeconds,
      submittedAt: submittedAtDate.toISOString(),
    };
  }

  async findAllForStudent(
    student: UserDocument,
    query: { testId?: string; status?: string; page?: number; limit?: number },
  ) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 10));

    const filter: Record<string, any> = {
      studentId: student._id,
    };
    if (query.testId && Types.ObjectId.isValid(query.testId)) {
      filter['testId'] = new Types.ObjectId(query.testId);
    }
    if (query.status) {
      filter['status'] = query.status;
    }

    const [docs, total] = await Promise.all([
      this.examAttemptModel
        .find(filter)
        .sort({ startedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('testId', 'title skill allowedModes parts')
        .exec(),
      this.examAttemptModel.countDocuments(filter).exec(),
    ]);

    const items = docs.map((att: any) => {
      const test = att.testId;
      const id = extractObjectId(att._id);
      return {
        id,
        attemptId: id,
        testId: test ? extractObjectId(test._id || test) : '',
        testTitle: test?.title || 'IELTS Exam Test',
        skill: att.skill,
        mode: att.mode,
        partId: att.partId ? extractObjectId(att.partId) : null,
        partTitle: null,
        status: att.status,
        scorePercent: att.scorePercent ?? null,
        passed: att.passed ?? null,
        startedAt: att.startedAt ? att.startedAt.toISOString() : null,
        submittedAt: att.submittedAt ? att.submittedAt.toISOString() : null,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  private stripPartForStudent(part: any) {
    const partId = extractObjectId(part._id);
    let qMin = 999999;
    let qMax = 0;
    let totalPartQuestions = 0;

    const questionGroups = (part.questionGroups || []).map((g: any, gIdx: number) => {
      const gQuestions = (g.questions || []).map((q: any) => {
        const qNum = Number(q.number);
        if (qNum < qMin) qMin = qNum;
        if (qNum > qMax) qMax = qNum;
        totalPartQuestions++;
        return {
          id: q.number.toString(),
          groupId: extractObjectId(g._id || `grp-${gIdx}`),
          questionNumber: q.number,
          prompt: q.prompt,
          questionType: q.type || g.type,
          options: q.options || [],
          maxSelections: 1,
          maxWords: q.grading?.maxWords || g.maxWords || undefined,
        };
      });

      return {
        id: extractObjectId(g._id || `grp-${gIdx}`),
        partId,
        groupNumber: g.order || gIdx + 1,
        title: g.title,
        instructionHtml: g.instruction || '',
        instruction: g.instruction || '',
        questionType: g.type,
        questionNumberStart: gQuestions.length > 0 ? gQuestions[0].questionNumber : 1,
        questionNumberEnd: gQuestions.length > 0 ? gQuestions[gQuestions.length - 1].questionNumber : 1,
        sharedOptions: g.sharedOptions || [],
        maxWords: g.maxWords,
        questions: gQuestions,
      };
    });

    if (qMin > qMax) {
      qMin = 1;
      qMax = Math.max(1, totalPartQuestions);
    }

    return {
      id: partId,
      partNumber: part.ordinal,
      ordinal: part.ordinal,
      partType: (part.type || 'PASSAGE').toUpperCase(),
      type: part.type,
      title: part.title,
      passageTitle: part.title,
      passageHtml: part.contentHtml || '',
      contentHtml: part.contentHtml || null,
      audioAsset: part.audioAssetId ? { assetId: extractObjectId(part.audioAssetId) } : undefined,
      audio: part.audioAssetId ? { assetId: extractObjectId(part.audioAssetId) } : null,
      durationSeconds: part.durationSeconds || undefined,
      questionCount: totalPartQuestions,
      questionNumberRange: { start: qMin, end: qMax },
      questionGroups,
    };
  }

  private formatAttemptResponse(attempt: ExamAttemptDocument, test?: ExamTestDocument | null) {
    const raw = typeof attempt.toObject === 'function' ? attempt.toObject() : attempt;

    const remainingSeconds = attempt.expiresAt
      ? Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000))
      : 0;

    let partsSummary: any[] = [];
    let publicParts: any[] = [];

    if (test && test.parts) {
      const filteredParts = test.parts.filter((p: any) => {
        if (attempt.mode === ExamMode.PART && attempt.partId) {
          return extractObjectId(p._id) === attempt.partId;
        }
        return true;
      });

      partsSummary = filteredParts.map((p: any) => {
        let partQCount = 0;
        (p.questionGroups || []).forEach((g: any) => {
          partQCount += (g.questions || []).length;
        });
        return {
          id: extractObjectId(p._id),
          ordinal: p.ordinal,
          title: p.title,
          questionCount: partQCount,
        };
      });

      publicParts = filteredParts.map((p: any) => this.stripPartForStudent(p));
    }

    const savedAnswersObj: Record<string, any> = {};
    if (raw.savedAnswers instanceof Map) {
      raw.savedAnswers.forEach((v: any, k: string) => {
        savedAnswersObj[k] = v;
      });
    } else if (raw.savedAnswers && typeof raw.savedAnswers === 'object') {
      Object.assign(savedAnswersObj, raw.savedAnswers);
    }

    const totalQuestions = (raw.scopeQuestionIds || []).length;
    const answeredCount = Object.values(savedAnswersObj).filter((v) =>
      Array.isArray(v) ? v.length > 0 : String(v ?? '').trim().length > 0,
    ).length;

    const durationSeconds = raw.expiresAt && raw.startedAt
      ? Math.max(0, Math.floor((new Date(raw.expiresAt).getTime() - new Date(raw.startedAt).getTime()) / 1000))
      : 3600;

    const id = extractObjectId(raw._id);
    const testId = extractObjectId(raw.testId);

    return {
      id,
      attemptId: id,
      testId,
      testTitle: test?.title || 'IELTS Exam Test',
      exerciseVersion: raw.exerciseVersion,
      skill: raw.skill,
      mode: raw.mode,
      partId: raw.partId ? extractObjectId(raw.partId) : null,
      studentAssignmentId: raw.studentAssignmentId ? extractObjectId(raw.studentAssignmentId) : null,
      status: raw.status,
      startedAt: raw.startedAt instanceof Date ? raw.startedAt.toISOString() : new Date(raw.startedAt).toISOString(),
      expiresAt: raw.expiresAt instanceof Date ? raw.expiresAt.toISOString() : new Date(raw.expiresAt).toISOString(),
      serverTime: new Date().toISOString(),
      remainingSeconds,
      durationSeconds,
      revision: raw.answersRevision ?? 0,
      answersRevision: raw.answersRevision ?? 0,
      answers: savedAnswersObj,
      savedAnswers: savedAnswersObj,
      flaggedQuestionIds: raw.flaggedQuestionIds || [],
      scopeQuestionIds: raw.scopeQuestionIds || [],
      totalQuestions,
      answeredCount,
      submittedAt: raw.submittedAt
        ? raw.submittedAt instanceof Date
          ? raw.submittedAt.toISOString()
          : new Date(raw.submittedAt).toISOString()
        : null,
      parts: publicParts.length > 0 ? publicParts : partsSummary,
    };
  }
}
