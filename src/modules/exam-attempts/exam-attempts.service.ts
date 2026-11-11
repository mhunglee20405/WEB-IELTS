import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
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
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamMode,
  ExamSkill,
  AttemptStatus,
  ExamTestStatus,
  UserRole,
  StudentAssignmentStatus,
} from 'src/database/schemas/enums';
import {
  CreateExamAttemptDto,
  SaveAnswersDto,
  SubmitAttemptDto,
} from './dto/exam-attempt.dto';
import { extractObjectId } from 'src/modules/exam-tests/mappers/exam-test.mapper';
import { gradeQuestion } from 'src/common/utils/exam-grading.util';

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
  ) {}

  async createAttempt(dto: CreateExamAttemptDto, student: UserDocument) {
    if (!Types.ObjectId.isValid(dto.testId)) {
      throw new NotFoundException('Exam test not found');
    }

    // Check idempotency first if provided
    if (dto.idempotencyKey) {
      const existingKeyAttempt = await this.examAttemptModel
        .findOne({ idempotencyKey: dto.idempotencyKey })
        .exec();
      if (existingKeyAttempt) {
        return this.formatAttemptResponse(existingKeyAttempt);
      }
    }

    const test = await this.examTestModel.findById(dto.testId).exec();
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

      if (linkedAssignment) {
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
      // If expiresAt has passed, auto-submit or expire it
      if (existingActive.expiresAt && Date.now() > existingActive.expiresAt.getTime()) {
        existingActive.status = AttemptStatus.EXPIRED;
        await existingActive.save();
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
    const expiresAt = new Date(startedAt.getTime() + durationSeconds * 1000);

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

    const saved = await attempt.save();
    return this.formatAttemptResponse(saved, test);
  }

  async getAttempt(attemptId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (actor.role === UserRole.STUDENT && extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You cannot access another student’s attempt');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
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

    // Check expiry
    if (attempt.expiresAt && Date.now() > attempt.expiresAt.getTime() + 10000) {
      attempt.status = AttemptStatus.AUTO_SUBMITTED;
      await attempt.save();
      throw new BadRequestException('Exam time has expired');
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

    // Merge answers into savedAnswers Map (only accept question numbers in scope)
    const validScope = new Set(attempt.scopeQuestionIds);
    const savedKeys: string[] = [];

    const currentMap = attempt.savedAnswers instanceof Map
      ? attempt.savedAnswers
      : new Map(Object.entries(attempt.savedAnswers || {}));

    for (const ans of dto.answers) {
      if (validScope.has(ans.questionId.toString())) {
        currentMap.set(ans.questionId.toString(), ans.value);
        savedKeys.push(ans.questionId.toString());
      }
    }

    attempt.savedAnswers = currentMap;
    attempt.answersRevision += 1;
    attempt.lastSavedAt = new Date();

    await attempt.save();

    return {
      attemptId: extractObjectId(attempt._id),
      answersRevision: attempt.answersRevision,
      savedQuestionIds: Array.from(currentMap.keys()),
      lastSavedAt: attempt.lastSavedAt,
    };
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

    // If already submitted, return idempotent result
    if (attempt.status === AttemptStatus.SUBMITTED || attempt.status === AttemptStatus.AUTO_SUBMITTED) {
      return this.buildResultPayload(attempt, test);
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

    const studentAnswers = attempt.savedAnswers instanceof Map
      ? attempt.savedAnswers
      : new Map(Object.entries(attempt.savedAnswers || {}));

    let earnedPoints = 0;
    let totalPoints = 0;
    let correctCount = 0;
    const questionCount = attempt.scopeQuestionIds.length;

    const gradedAnswers: any[] = [];

    for (const qNum of attempt.scopeQuestionIds) {
      const q = questionMap.get(qNum);
      const qPoints = q?.points ?? 1;
      totalPoints += qPoints;

      const studentVal = studentAnswers.get(qNum);
      const gradeRes = gradeQuestion(q?.type || q?.groupType, studentVal, q?.grading, qPoints);

      if (gradeRes.isCorrect) {
        correctCount++;
        earnedPoints += gradeRes.awardedPoints;
      }

      gradedAnswers.push({
        questionId: qNum,
        value: typeof studentVal === 'object' ? JSON.stringify(studentVal) : String(studentVal ?? ''),
        awardedPoints: gradeRes.awardedPoints,
        isCorrect: gradeRes.isCorrect,
      });
    }

    // Strict unrounded pass check
    const rawScore = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const passScore = test.passScore ?? 70;
    const isPassed = rawScore >= passScore;
    const scorePercent = Math.round(rawScore * 100) / 100;

    const submittedAt = new Date();
    attempt.status = AttemptStatus.SUBMITTED;
    attempt.submittedAt = submittedAt;
    await attempt.save();

    // If homework (linked to studentAssignmentId), record in submissions collection & update student_assignment
    let submissionDoc: SubmissionDocument | null = null;
    if (attempt.studentAssignmentId) {
      const sa = await this.studentAssignmentModel.findById(attempt.studentAssignmentId).exec();
      if (sa) {
        const existingCount = await this.submissionModel.countDocuments({
          studentAssignmentId: sa._id,
        });

        submissionDoc = new this.submissionModel({
          studentAssignmentId: sa._id,
          assignmentId: attempt.assignmentId || sa.assignmentId,
          studentId: actor._id,
          attemptNo: existingCount + 1,
          answers: gradedAnswers,
          scorePercent,
          correctCount,
          totalQuestions: questionCount,
          isPassed,
          submittedAt,
          exerciseVersion: attempt.exerciseVersion,
          examAttemptId: attempt._id,
          mode: attempt.mode,
          partId: attempt.partId,
          scopeQuestionIds: attempt.scopeQuestionIds,
          earnedPoints,
          totalPoints,
        });

        await submissionDoc.save();

        sa.lastSubmittedAt = submittedAt;
        sa.bestScore = Math.max(sa.bestScore || 0, scorePercent);
        if (isPassed) {
          sa.status = StudentAssignmentStatus.PASSED;
          if (!sa.passedAt) sa.passedAt = submittedAt;
        } else if (sa.status !== StudentAssignmentStatus.PASSED) {
          sa.status = StudentAssignmentStatus.SUBMITTED;
        }
        await sa.save();
      }
    }

    return this.buildResultPayload(attempt, test, submissionDoc?._id?.toString(), {
      earnedPoints,
      totalPoints,
      scorePercent,
      correctCount,
      questionCount,
      isPassed,
      passScore,
      submittedAt,
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

    if (actor.role === UserRole.STUDENT && extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You cannot access another student’s result');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    if (!test) {
      throw new NotFoundException('Associated exam test not found');
    }

    return this.buildResultPayload(attempt, test);
  }

  async getReview(attemptId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(attemptId)) {
      throw new NotFoundException('Exam attempt not found');
    }
    const attempt = await this.examAttemptModel.findById(attemptId).exec();
    if (!attempt) {
      throw new NotFoundException('Exam attempt not found');
    }

    if (actor.role === UserRole.STUDENT && extractObjectId(attempt.studentId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You cannot access another student’s review');
    }

    const test = await this.examTestModel.findById(attempt.testId).exec();
    if (!test) {
      throw new NotFoundException('Associated exam test not found');
    }

    // Grade and check PASS status
    const result = await this.buildResultPayload(attempt, test);

    // ZERO LEAKAGE: If student has not passed, review is locked (403 ANSWER_REVIEW_LOCKED)
    if (actor.role === UserRole.STUDENT && !result.passed) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'ANSWER_REVIEW_LOCKED',
        message: 'Đáp án và lời giải chỉ được mở khóa khi bạn đạt điểm PASS (>= 70%)',
      });
    }

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
      skill: attempt.skill,
      mode: attempt.mode,
      partId: attempt.partId,
      scorePercent: result.scorePercent,
      passed: result.passed,
      questions: reviewQuestions,
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
    const passScore = test.passScore ?? 70;

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

      for (const qNum of attempt.scopeQuestionIds) {
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
      isPassed = rawScore >= passScore;
      scorePercent = Math.round(rawScore * 100) / 100;
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

    return {
      attemptId: extractObjectId(attempt._id),
      submissionId: submissionId || null,
      status: attempt.status,
      skill: attempt.skill,
      mode: attempt.mode,
      partId: attempt.partId,
      earnedPoints,
      totalPoints,
      scorePercent,
      passScore,
      passed: Boolean(isPassed),
      correctCount,
      questionCount: attempt.scopeQuestionIds.length,
      answerReviewAvailable: Boolean(isPassed),
      translation: {
        available: isReading && Boolean(isPassed),
        unlockedPassageIds,
      },
      submittedAt: attempt.submittedAt || null,
    };
  }

  private formatAttemptResponse(attempt: ExamAttemptDocument, test?: ExamTestDocument | null) {
    const raw = typeof attempt.toObject === 'function' ? attempt.toObject() : attempt;

    const remainingSeconds = attempt.expiresAt
      ? Math.max(0, Math.floor((new Date(attempt.expiresAt).getTime() - Date.now()) / 1000))
      : 0;

    let partsSummary: any[] = [];
    if (test && test.parts) {
      partsSummary = test.parts
        .filter((p: any) => {
          if (attempt.mode === ExamMode.PART) {
            return extractObjectId(p._id) === attempt.partId;
          }
          return true;
        })
        .map((p: any) => {
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
    }

    const savedAnswersObj: Record<string, any> = {};
    if (raw.savedAnswers instanceof Map) {
      raw.savedAnswers.forEach((v: any, k: string) => {
        savedAnswersObj[k] = v;
      });
    } else if (raw.savedAnswers && typeof raw.savedAnswers === 'object') {
      Object.assign(savedAnswersObj, raw.savedAnswers);
    }

    return {
      id: extractObjectId(raw._id),
      testId: extractObjectId(raw.testId),
      exerciseVersion: raw.exerciseVersion,
      skill: raw.skill,
      mode: raw.mode,
      partId: raw.partId,
      status: raw.status,
      startedAt: raw.startedAt,
      expiresAt: raw.expiresAt,
      remainingSeconds,
      answersRevision: raw.answersRevision,
      savedAnswers: savedAnswersObj,
      scopeQuestionIds: raw.scopeQuestionIds,
      parts: partsSummary,
    };
  }
}
