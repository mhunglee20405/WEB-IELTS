import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Assignment, AssignmentDocument, ExerciseSnapshot } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Exercise, ExerciseDocument } from 'src/database/schemas/exercise.schema';
import { ExamTest, ExamTestDocument } from 'src/database/schemas/exam-test.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { Submission, SubmissionDocument } from 'src/database/schemas/submission.schema';
import {
  TranslationSubmission,
  TranslationSubmissionDocument,
} from 'src/database/schemas/translation-submission.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  CourseStatus,
  EnrollmentStatus,
  ExerciseStatus,
  ExamTestStatus,
  NotificationType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { formatVnDateTime, createVnDailyBounds, createVnDailyAssignmentBounds } from 'src/common/utils/timezone.util';
import { ExerciseMapper } from 'src/modules/exercises/mappers/exercise.mapper';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { AuditService } from 'src/modules/audit/audit.service';

export function extractObjectId(ref: unknown): string {
  if (ref === null || ref === undefined) {
    return '';
  }
  if (ref instanceof Types.ObjectId) {
    return ref.toHexString();
  }
  if (ref && typeof ref === 'object' && '_id' in ref) {
    const id = (ref as { _id: unknown })._id;
    if (id === null || id === undefined) {
      return '';
    }
    return id instanceof Types.ObjectId ? id.toHexString() : String(id);
  }
  return String(ref);
}

/**
 * Computes assignment lifecycle status based on current time:
 * DRAFT -> SCHEDULED (now < availableAt) -> AVAILABLE (availableAt <= now < dueAt) -> EXPIRED (now >= dueAt)
 */
export function computeAssignmentLifecycleStatus(
  assignment: any,
  now: Date = new Date(),
): string {
  const status = assignment.status;
  if (status === AssignmentStatus.DRAFT || status === 'DRAFT') {
    return 'DRAFT';
  }
  if (status === AssignmentStatus.ARCHIVED || status === AssignmentStatus.CLOSED) {
    return String(status).toUpperCase();
  }
  const nowMs = now.getTime();
  const openMs = new Date(assignment.openAt).getTime();
  const deadlineMs = new Date(assignment.deadlineAt).getTime();

  if (nowMs < openMs) {
    return 'SCHEDULED';
  }
  if (nowMs >= openMs && nowMs < deadlineMs) {
    return 'AVAILABLE';
  }
  return 'EXPIRED';
}

/**
 * Computes student assignment status based on submission and deadline bounds:
 * Returns status, scheduleStatus (DRAFT, SCHEDULED, AVAILABLE, EXPIRED, COMPLETED), isAvailable and remainingSeconds.
 */
export function computeStudentAssignmentLifecycleStatus(
  assignment: any,
  studentAssignment: any,
  now: Date = new Date(),
): { status: string; scheduleStatus: string; isAvailable: boolean; remainingSeconds: number } {
  const nowMs = now.getTime();
  const openMs = new Date(assignment.openAt).getTime();
  const effectiveDeadlineMs = new Date(studentAssignment.effectiveDeadlineAt).getTime();

  const attemptsCount =
    studentAssignment.attemptsCount ?? (studentAssignment.lastSubmittedAt ? 1 : 0);
  const maxAttempts = assignment?.maxAttempts;
  const canRetakeSubmitted =
    studentAssignment.status === StudentAssignmentStatus.SUBMITTED &&
    Boolean(assignment?.allowRetake) &&
    (maxAttempts === undefined || maxAttempts === null || attemptsCount < maxAttempts);

  const isCompleted =
    Boolean(studentAssignment.isTargetAchieved) ||
    studentAssignment.status === StudentAssignmentStatus.PASSED ||
    studentAssignment.status === StudentAssignmentStatus.COMPLETED ||
    (studentAssignment.status === StudentAssignmentStatus.SUBMITTED && !canRetakeSubmitted);

  if (isCompleted) {
    return {
      status: studentAssignment.status || 'completed',
      scheduleStatus: 'COMPLETED',
      isAvailable: false,
      remainingSeconds: 0,
    };
  }

  // If current time is earlier than assignment opening time (e.g. before 06:00 AM VN)
  if (nowMs < openMs) {
    return {
      status: StudentAssignmentStatus.NOT_STARTED,
      scheduleStatus: 'SCHEDULED',
      isAvailable: false,
      remainingSeconds: Math.max(0, Math.floor((openMs - nowMs) / 1000)),
    };
  }

  if (nowMs >= effectiveDeadlineMs) {
    return {
      status: StudentAssignmentStatus.OVERDUE,
      scheduleStatus: 'EXPIRED',
      isAvailable: false,
      remainingSeconds: 0,
    };
  }

  return {
    status: studentAssignment.status || StudentAssignmentStatus.NOT_STARTED,
    scheduleStatus: 'AVAILABLE',
    isAvailable: true,
    remainingSeconds: Math.max(0, Math.floor((effectiveDeadlineMs - nowMs) / 1000)),
  };
}

@Injectable()
export class AssignmentsService implements OnModuleInit {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Exercise.name) private exerciseModel: Model<ExerciseDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(ExamTest.name) @Optional() private examTestModel?: Model<ExamTestDocument>,
    @InjectModel(Submission.name) @Optional() private submissionModel?: Model<SubmissionDocument>,
    @InjectModel(TranslationSubmission.name) @Optional() private translationModel?: Model<TranslationSubmissionDocument>,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private auditService?: AuditService,
    @Optional() @InjectConnection() private readonly connection?: Connection,
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

  private async execQuery<T>(query: any): Promise<T> {
    if (!query) return query;
    return typeof query.exec === 'function' ? await query.exec() : await query;
  }

  private async hydrateAssignmentRefs(assignments: any[]): Promise<{
    exerciseMap: Map<string, any>;
    examTestMap: Map<string, any>;
  }> {
    const exerciseMap = new Map<string, any>();
    const examTestMap = new Map<string, any>();
    const exerciseLookupIds = new Set<string>();
    const examTestLookupIds = new Set<string>();

    for (const asg of assignments || []) {
      if (!asg) continue;
      const raw = typeof asg.toObject === 'function' ? asg.toObject() : asg;

      if (raw.exerciseId && typeof raw.exerciseId === 'object' && (raw.exerciseId.title || raw.exerciseId.type)) {
        const idStr = extractObjectId(raw.exerciseId);
        if (idStr) exerciseMap.set(idStr, raw.exerciseId);
      } else if (raw.exerciseId != null) {
        const idStr = extractObjectId(raw.exerciseId);
        if (idStr) exerciseLookupIds.add(idStr);
      }

      if (raw.examTestId && typeof raw.examTestId === 'object' && (raw.examTestId.title || raw.examTestId.skill)) {
        const idStr = extractObjectId(raw.examTestId);
        if (idStr) examTestMap.set(idStr, raw.examTestId);
      } else if (raw.examTestId != null) {
        const idStr = extractObjectId(raw.examTestId);
        if (idStr) examTestLookupIds.add(idStr);
      }
    }

    const exerciseIdsToFetch = Array.from(exerciseLookupIds).filter((id) => !exerciseMap.has(id));
    if (exerciseIdsToFetch.length > 0 && this.exerciseModel) {
      const objectIds = exerciseIdsToFetch.map((id) =>
        Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
      );
      if (typeof this.exerciseModel.find === 'function') {
        const q = this.exerciseModel.find({ _id: { $in: objectIds } });
        const docs = await (typeof q?.select === 'function'
          ? this.execQuery<any[]>(q.select('title type passScore'))
          : this.execQuery<any[]>(q));
        for (const ex of docs || []) {
          const exId = extractObjectId(ex._id);
          if (exId) exerciseMap.set(exId, ex);
        }
      } else if (typeof this.exerciseModel.findById === 'function') {
        for (const id of exerciseIdsToFetch) {
          const q = this.exerciseModel.findById(id);
          const ex = q
            ? await (typeof q?.select === 'function'
                ? this.execQuery<any>(q.select('title type passScore'))
                : this.execQuery<any>(q))
            : null;
          if (ex) {
            const exId = extractObjectId(ex._id);
            if (exId) exerciseMap.set(exId, ex);
          }
        }
      }
    }

    // Legacy ExamTest assignments store the ExamTest._id in exerciseId without examTestId
    for (const id of exerciseLookupIds) {
      if (!exerciseMap.has(id)) {
        examTestLookupIds.add(id);
      }
    }

    const examTestIdsToFetch = Array.from(examTestLookupIds).filter((id) => !examTestMap.has(id));
    if (examTestIdsToFetch.length > 0 && this.examTestModel) {
      const objectIds = examTestIdsToFetch.map((id) =>
        Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
      );
      if (typeof this.examTestModel.find === 'function') {
        const q = this.examTestModel.find({ _id: { $in: objectIds } });
        const docs = await (typeof q?.select === 'function'
          ? this.execQuery<any[]>(q.select('title skill passScore'))
          : this.execQuery<any[]>(q));
        for (const t of docs || []) {
          const tId = extractObjectId(t._id);
          if (tId) examTestMap.set(tId, t);
        }
      } else if (typeof this.examTestModel.findById === 'function') {
        for (const id of examTestIdsToFetch) {
          const q = this.examTestModel.findById(id);
          const t = q
            ? await (typeof q?.select === 'function'
                ? this.execQuery<any>(q.select('title skill passScore'))
                : this.execQuery<any>(q))
            : null;
          if (t) {
            const tId = extractObjectId(t._id);
            if (tId) examTestMap.set(tId, t);
          }
        }
      }
    }

    return { exerciseMap, examTestMap };
  }

  private resolveAssignmentMediaMeta(
    raw: any,
    refs?: { exerciseMap: Map<string, any>; examTestMap: Map<string, any> },
  ): {
    exerciseId: string;
    examTestId?: string;
    exercise?: { id: string; title: string; type: string; passScore?: number };
    exerciseType: string;
  } {
    const rawExerciseId = raw.exerciseId != null ? extractObjectId(raw.exerciseId) : '';
    const rawExamTestId = raw.examTestId != null ? extractObjectId(raw.examTestId) : '';

    const resolvedExercise =
      raw.exerciseId && typeof raw.exerciseId === 'object' && (raw.exerciseId.title || raw.exerciseId.type)
        ? raw.exerciseId
        : rawExerciseId
          ? refs?.exerciseMap?.get(rawExerciseId)
          : undefined;

    const resolvedExamTest =
      raw.examTestId && typeof raw.examTestId === 'object' && (raw.examTestId.title || raw.examTestId.skill)
        ? raw.examTestId
        : (rawExamTestId ? refs?.examTestMap?.get(rawExamTestId) : undefined) ||
          (rawExerciseId ? refs?.examTestMap?.get(rawExerciseId) : undefined);

    const effectiveExamTestId =
      rawExamTestId || (resolvedExamTest ? extractObjectId(resolvedExamTest._id || resolvedExamTest) : undefined);

    const effectiveExerciseId = rawExerciseId || effectiveExamTestId || '';

    const resolvedType =
      raw.exerciseType ||
      resolvedExercise?.type ||
      (resolvedExamTest?.skill ? String(resolvedExamTest.skill).toLowerCase() : undefined) ||
      (raw.exerciseSnapshot?.type ? String(raw.exerciseSnapshot.type).toLowerCase() : undefined) ||
      'reading';

    const exercise = resolvedExercise
      ? {
          id: extractObjectId(resolvedExercise._id),
          title: resolvedExercise.title,
          type: resolvedExercise.type,
          passScore: resolvedExercise.passScore,
        }
      : resolvedExamTest
        ? {
            id: extractObjectId(resolvedExamTest._id),
            title: resolvedExamTest.title,
            type: String(resolvedExamTest.skill || resolvedType).toLowerCase(),
            passScore: resolvedExamTest.passScore,
          }
        : undefined;

    return {
      exerciseId: effectiveExerciseId,
      examTestId: effectiveExamTestId,
      exercise,
      exerciseType: String(resolvedType).toLowerCase(),
    };
  }

  async onModuleInit() {
    try {
      // Auto-heal existing assignments where allowRetake defaulted to false
      // and maxAttempts was either not set or set to > 1
      await this.assignmentModel.updateMany(
        {
          allowRetake: false,
          $or: [
            { maxAttempts: { $gt: 1 } },
            { maxAttempts: { $exists: false } },
            { maxAttempts: null },
          ],
        },
        { $set: { allowRetake: true } },
      );

      // Ensure already-passed student_assignments keep isTargetAchieved = true
      await this.studentAssignmentModel.updateMany(
        {
          status: StudentAssignmentStatus.PASSED,
          isTargetAchieved: { $ne: true },
        },
        {
          $set: {
            isTargetAchieved: true,
          },
        },
      );

      // Evaluate unpassed student_assignments against each assignment's configured targetScorePercent (default 70)
      if (
        typeof this.studentAssignmentModel?.find === 'function' &&
        typeof this.assignmentModel?.find === 'function'
      ) {
        const candidateSas = await this.execQuery<any[]>(
          this.studentAssignmentModel
            .find({
              status: { $ne: StudentAssignmentStatus.PASSED },
              bestScore: { $ne: null },
            })
            .select('_id assignmentId bestScore'),
        );

        if (candidateSas && candidateSas.length > 0) {
          const asgIds = Array.from(
            new Set(candidateSas.map((sa) => extractObjectId(sa.assignmentId)).filter(Boolean)),
          );
          const assignments = await this.execQuery<any[]>(
            this.assignmentModel
              .find({
                _id: {
                  $in: asgIds.map((id) =>
                    Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
                  ),
                },
              })
              .select('targetScorePercent'),
          );
          const targetMap = new Map<string, number>();
          for (const a of assignments || []) {
            targetMap.set(extractObjectId(a._id), a.targetScorePercent ?? 70);
          }

          for (const sa of candidateSas) {
            const targetScore = targetMap.get(extractObjectId(sa.assignmentId)) ?? 70;
            if (sa.bestScore !== undefined && sa.bestScore !== null && sa.bestScore >= targetScore) {
              await this.studentAssignmentModel.updateOne(
                { _id: sa._id },
                {
                  $set: {
                    isTargetAchieved: true,
                    status: StudentAssignmentStatus.PASSED,
                  },
                },
              );
            }
          }
        }
      }

      // Auto-publish scheduled assignments whose openAt has arrived
      await this.assignmentModel.updateMany(
        {
          status: { $in: [AssignmentStatus.SCHEDULED, 'scheduled', 'SCHEDULED'] },
          openAt: { $lte: new Date() },
          deadlineAt: { $gt: new Date() },
        },
        { $set: { status: AssignmentStatus.PUBLISHED } },
      );

      // Auto-heal attemptsCount from submissions, respecting each assignment's targetScorePercent
      if (this.submissionModel) {
        const counts = await this.submissionModel.aggregate([
          {
            $group: {
              _id: '$studentAssignmentId',
              assignmentId: { $first: '$assignmentId' },
              count: { $sum: 1 },
              maxScore: { $max: '$scorePercent' },
            },
          },
        ]);
        if (counts && counts.length > 0) {
          const targetByAsgId = new Map<string, number>();
          const missingAsgSaIds: any[] = [];
          const asgIdsToLoad = new Set<string>();

          for (const c of counts) {
            if (c.assignmentId) {
              asgIdsToLoad.add(extractObjectId(c.assignmentId));
            } else if (c._id) {
              missingAsgSaIds.push(c._id);
            }
          }

          const saToAsgMap = new Map<string, string>();
          if (missingAsgSaIds.length > 0 && typeof this.studentAssignmentModel?.find === 'function') {
            const sas = await this.execQuery<any[]>(
              this.studentAssignmentModel
                .find({ _id: { $in: missingAsgSaIds } })
                .select('_id assignmentId'),
            );
            for (const sa of sas || []) {
              const aId = extractObjectId(sa.assignmentId);
              if (aId) {
                saToAsgMap.set(extractObjectId(sa._id), aId);
                asgIdsToLoad.add(aId);
              }
            }
          }

          if (asgIdsToLoad.size > 0 && typeof this.assignmentModel?.find === 'function') {
            const asgs = await this.execQuery<any[]>(
              this.assignmentModel
                .find({
                  _id: {
                    $in: Array.from(asgIdsToLoad).map((id) =>
                      Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : id,
                    ),
                  },
                })
                .select('targetScorePercent'),
            );
            for (const a of asgs || []) {
              targetByAsgId.set(extractObjectId(a._id), a.targetScorePercent ?? 70);
            }
          }

          for (const c of counts) {
            if (c._id) {
              const saIdStr = extractObjectId(c._id);
              const asgIdStr = c.assignmentId
                ? extractObjectId(c.assignmentId)
                : saToAsgMap.get(saIdStr);
              const targetScore = asgIdStr ? (targetByAsgId.get(asgIdStr) ?? 70) : 70;
              await this.studentAssignmentModel.updateOne(
                { _id: c._id },
                {
                  $set: {
                    attemptsCount: c.count,
                    ...(c.maxScore !== undefined && c.maxScore >= targetScore
                      ? { isTargetAchieved: true, status: StudentAssignmentStatus.PASSED }
                      : {}),
                  },
                },
              );
            }
          }
        }
      }
    } catch (err: any) {
      this.logger.warn(`Failed to auto-heal existing assignments allowRetake: ${err.message}`);
    }
  }

  async validateAssignment(dto: CreateAssignmentDto, actor: UserDocument): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (actor.role === UserRole.STUDENT) {
      errors.push('Students are not authorized to create or validate assignments');
      return { valid: false, errors };
    }

    let course: any = null;
    if (!dto.courseId || !Types.ObjectId.isValid(dto.courseId)) {
      errors.push('courseId is missing or invalid');
    } else {
      course = await this.courseModel.findById(dto.courseId).exec();
      if (!course) {
        errors.push('Target course does not exist');
      } else {
        if (course.status === CourseStatus.ARCHIVED) {
          errors.push('Cannot assign exercises to an archived course');
        }
        if (actor.role === UserRole.TEACHER) {
          const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
          if (!isTeacher) {
            errors.push('You can only create assignments for courses you teach');
          }
        }
      }
    }

    let resolvedExamTest: any = null;
    let questionsInScope: any[] = [];

    const targetExerciseId = dto.exerciseId || dto.examTestId;
    if (!targetExerciseId || !Types.ObjectId.isValid(targetExerciseId)) {
      errors.push('exerciseId or examTestId is missing or invalid');
    } else {
      const exercise = await this.exerciseModel
        .findById(targetExerciseId)
        .select('+questions.answerSpecification +questions.explanation')
        .exec();

      if (exercise) {
        if (exercise.status !== ExerciseStatus.PUBLISHED) {
          errors.push('Selected exercise is not published (must be PUBLISHED)');
        }
        questionsInScope = exercise.questions || [];
      } else if (this.examTestModel) {
        resolvedExamTest = await this.examTestModel.findById(targetExerciseId).exec();
        if (!resolvedExamTest) {
          errors.push('Selected exercise or exam test was not found');
        } else {
          if (resolvedExamTest.status !== ExamTestStatus.PUBLISHED) {
            errors.push('Selected exam test is not published (must be PUBLISHED)');
          }

          if (dto.requiredScope === 'PART') {
            if (!dto.requiredPartId) {
              errors.push('requiredPartId is required when requiredScope is PART');
            } else {
              const part = (resolvedExamTest.parts || []).find(
                (p: any) => extractObjectId(p._id) === dto.requiredPartId,
              );
              if (!part) {
                errors.push('requiredPartId does not exist in this exam test');
              } else {
                let groups = part.questionGroups || [];
                if (dto.selectedQuestionGroupIds && dto.selectedQuestionGroupIds.length > 0) {
                  const availableGroupIds = new Set(groups.map((g: any) => extractObjectId(g._id)));
                  for (const gid of dto.selectedQuestionGroupIds) {
                    if (!availableGroupIds.has(gid)) {
                      errors.push(`selectedQuestionGroupId '${gid}' does not exist in the selected part`);
                    }
                  }
                  groups = groups.filter((g: any) => dto.selectedQuestionGroupIds!.includes(extractObjectId(g._id)));
                }
                for (const g of groups) {
                  for (const q of g.questions || []) {
                    questionsInScope.push(q);
                  }
                }
              }
            }
          } else {
            // FULL scope
            for (const part of resolvedExamTest.parts || []) {
              for (const g of part.questionGroups || []) {
                for (const q of g.questions || []) {
                  questionsInScope.push(q);
                }
              }
            }
          }
        }
      } else {
        errors.push('Selected exercise or exam test was not found');
      }
    }

    // Custom question groups override if provided
    if (dto.customQuestionGroups && dto.customQuestionGroups.length > 0) {
      questionsInScope = [];
      const seenNumbers = new Set<number>();
      for (const group of dto.customQuestionGroups) {
        if (!group.type) {
          errors.push('Every custom question group must specify an IELTS question type');
        }
        if (!group.questions || group.questions.length === 0) {
          errors.push(`Custom question group '${group.title || group.order}' has no questions`);
        } else {
          for (const q of group.questions) {
            if (seenNumbers.has(q.number)) {
              errors.push(`Duplicate question number ${q.number} in custom question groups`);
            }
            seenNumbers.add(q.number);
            if (!q.prompt || q.prompt.trim().length === 0) {
              errors.push(`Question ${q.number} must have a non-empty prompt`);
            }
            if (!q.grading || !q.grading.acceptedKeys || q.grading.acceptedKeys.length === 0) {
              errors.push(`Question ${q.number} must provide at least one acceptedKey in grading`);
            }
            questionsInScope.push(q);
          }
        }
      }
    } else {
      const seenNumbers = new Set<number | string>();
      for (const q of questionsInScope) {
        const id = q.number !== undefined ? q.number : q.questionId;
        if (seenNumbers.has(id)) {
          errors.push(`Duplicate question identifier '${id}' within assignment scope`);
        }
        seenNumbers.add(id);
      }
    }

    if (questionsInScope.length === 0 && errors.length === 0) {
      errors.push('Assignment must contain at least 1 question in its scope');
    }

    if (dto.assignedDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dto.assignedDate.trim())) {
        errors.push('assignedDate must be in YYYY-MM-DD format');
      }
    }

    if (dto.openAt && dto.deadlineAt) {
      if (new Date(dto.openAt).getTime() >= new Date(dto.deadlineAt).getTime()) {
        errors.push('openAt must be strictly earlier than deadlineAt');
      }
    }

    if (dto.durationSecondsOverride !== undefined && dto.durationSecondsOverride <= 0) {
      errors.push('durationSecondsOverride must be greater than 0');
    }

    if (dto.targetScorePercent !== undefined) {
      if (dto.targetScorePercent < 0 || dto.targetScorePercent > 100) {
        errors.push('targetScorePercent must be between 0 and 100');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  async previewAssignment(dto: CreateAssignmentDto, actor: UserDocument) {
    const val = await this.validateAssignment(dto, actor);
    if (!val.valid) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'BadRequest',
        code: 'ASSIGNMENT_VALIDATION_FAILED',
        message: 'Assignment configuration is invalid',
        errors: val.errors,
      });
    }

    const course = await this.courseModel.findById(dto.courseId).select('code title teacherId').exec();
    const enrolledCount = await this.enrollmentModel.countDocuments({
      courseId: course?._id,
      status: EnrollmentStatus.ACTIVE,
    });

    let bounds: any;
    if (dto.assignedDate || dto.targetDate) {
      bounds = createVnDailyAssignmentBounds(dto.assignedDate || dto.targetDate);
    } else if (dto.openAt && dto.deadlineAt) {
      bounds = {
        availableAt: new Date(dto.openAt),
        dueAt: new Date(dto.deadlineAt),
        openAt: new Date(dto.openAt),
        deadlineAt: new Date(dto.deadlineAt),
        assignedDate: formatVnDateTime(dto.openAt).slice(0, 10),
      };
    } else {
      bounds = createVnDailyAssignmentBounds();
    }

    let questionsPreview: any[] = [];
    let title = dto.title || '';
    let skill = 'READING';
    let durationSeconds = dto.durationSecondsOverride || 3600;

    let previewPassage: string | undefined = undefined;
    const targetExerciseId = dto.exerciseId || dto.examTestId;
    const examTest = this.examTestModel && targetExerciseId ? await this.examTestModel.findById(targetExerciseId).exec() : null;
    if (examTest) {
      if (!title) title = examTest.title;
      skill = examTest.skill;
      if (!dto.durationSecondsOverride) {
        durationSeconds = examTest.fullDurationSeconds || 3600;
      }
      if (dto.requiredScope === 'PART') {
        const part = (examTest.parts || []).find((p: any) => extractObjectId(p._id) === dto.requiredPartId);
        if (part) {
          previewPassage = part.contentHtml || (part as any).passage;
          if (!dto.durationSecondsOverride && part.durationSeconds) {
            durationSeconds = part.durationSeconds;
          }
          let groups = part.questionGroups || [];
          if (dto.selectedQuestionGroupIds && dto.selectedQuestionGroupIds.length > 0) {
            groups = groups.filter((g: any) => dto.selectedQuestionGroupIds!.includes(extractObjectId(g._id)));
          }
          for (const g of groups) {
            for (const q of g.questions || []) {
              questionsPreview.push({
                ...q,
                groupTitle: g.title,
                instruction: g.instruction,
                groupType: g.type,
              });
            }
          }
        }
      } else {
        previewPassage = (examTest.parts || []).map((p: any) => p.contentHtml || (p as any).passage).filter(Boolean).join('\n\n');
        for (const part of examTest.parts || []) {
          for (const g of part.questionGroups || []) {
            for (const q of g.questions || []) {
              questionsPreview.push({
                ...q,
                partTitle: part.title,
                groupTitle: g.title,
                instruction: g.instruction,
                groupType: g.type,
              });
            }
          }
        }
      }
    } else if (targetExerciseId) {
      const ex = await this.exerciseModel.findById(targetExerciseId).select('+questions.answerSpecification +questions.explanation').exec();
      if (ex) {
        if (!title) title = ex.title;
        skill = ex.type.toUpperCase();
        previewPassage = ex.passage;
        questionsPreview = ex.questions || [];
      }
    }

    if (dto.customQuestionGroups && dto.customQuestionGroups.length > 0) {
      questionsPreview = [];
      for (const g of dto.customQuestionGroups) {
        for (const q of g.questions || []) {
          questionsPreview.push({
            ...q,
            groupTitle: g.title,
            instruction: g.instruction,
            groupType: g.type,
          });
        }
      }
    }

    const totalPoints = questionsPreview.reduce((sum, q) => sum + (q.points || 1), 0);

    return {
      course: course ? { id: extractObjectId(course._id), code: course.code, title: course.title } : undefined,
      title,
      skill,
      scope: dto.requiredScope || 'FULL',
      requiredPartId: dto.requiredPartId || null,
      assignedDate: bounds.assignedDate,
      availableAt: bounds.availableAt,
      availableAtVn: formatVnDateTime(bounds.availableAt),
      openAt: bounds.availableAt,
      openAtVn: formatVnDateTime(bounds.availableAt),
      dueAt: bounds.dueAt,
      dueAtVn: formatVnDateTime(bounds.dueAt),
      deadlineAt: bounds.dueAt,
      deadlineAtVn: formatVnDateTime(bounds.dueAt),
      durationSeconds,
      targetScorePercent: dto.targetScorePercent ?? 70,
      questionCount: questionsPreview.length,
      totalPoints,
      enrolledStudentsCount: enrolledCount,
      passage: previewPassage,
      questions: questionsPreview,
    };
  }

  async previewById(id: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Assignment not found');
    }
    const assignment = await this.assignmentModel
      .findById(id)
      .select('+exerciseSnapshot')
      .populate('courseId', 'code title teacherId')
      .populate('examTestId', 'title skill passScore')
      .exec();
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }
    const course: any = assignment.courseId;
    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }
    const enrolledCount = await this.enrollmentModel.countDocuments({
      courseId: course._id,
      status: EnrollmentStatus.ACTIVE,
    });
    const refs = await this.hydrateAssignmentRefs([assignment]);
    const meta = this.resolveAssignmentMediaMeta(
      typeof assignment.toObject === 'function' ? assignment.toObject() : assignment,
      refs,
    );
    const snapshot: any = assignment.exerciseSnapshot || {};
    const questions = snapshot.questions || [];
    const totalPoints = questions.reduce((sum: number, q: any) => sum + (q.points || 1), 0);

    return {
      id: extractObjectId(assignment._id),
      course: { id: extractObjectId(course._id), code: course.code, title: course.title },
      title: assignment.title,
      exerciseId: meta.exerciseId,
      ...(meta.examTestId ? { examTestId: meta.examTestId } : {}),
      exerciseType: meta.exerciseType,
      scope: assignment.requiredScope || 'FULL',
      requiredPartId: assignment.requiredPartId || null,
      assignedDate: assignment.assignedDate || formatVnDateTime(assignment.openAt).slice(0, 10),
      availableAt: assignment.openAt,
      availableAtVn: formatVnDateTime(assignment.openAt),
      dueAt: assignment.deadlineAt,
      dueAtVn: formatVnDateTime(assignment.deadlineAt),
      durationSeconds: assignment.durationSecondsOverride || 3600,
      targetScorePercent: assignment.targetScorePercent ?? 70,
      questionCount: questions.length,
      totalPoints,
      enrolledStudentsCount: enrolledCount,
      exerciseSnapshot: assignment.exerciseSnapshot,
      passage: snapshot.passage,
      questions,
    };
  }

  async create(dto: CreateAssignmentDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot create assignments');
    }

    const targetExerciseId = dto.exerciseId || dto.examTestId;
    if (!dto.courseId || !Types.ObjectId.isValid(dto.courseId)) {
      throw new BadRequestException('Invalid courseId');
    }
    if (!targetExerciseId || !Types.ObjectId.isValid(targetExerciseId)) {
      throw new BadRequestException('Invalid exerciseId');
    }

    const course = await this.courseModel.findById(dto.courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }
    if (course.status === CourseStatus.ARCHIVED) {
      throw new BadRequestException('Cannot assign exercises to an archived course');
    }

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You can only create assignments for courses you teach');
      }
    }

    // 1. Validation check
    const val = await this.validateAssignment(dto, actor);
    if (!val.valid) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'BadRequest',
        code: 'ASSIGNMENT_VALIDATION_FAILED',
        message: 'Assignment configuration is invalid',
        errors: val.errors,
      });
    }

    // 2. Client Idempotency check
    if (dto.idempotencyKey && typeof this.assignmentModel.findOne === 'function') {
      const q = this.assignmentModel.findOne({ idempotencyKey: dto.idempotencyKey });
      const existing = q?.populate
        ? await q
            .populate('courseId', 'code title')
            .populate('examTestId', 'title skill passScore')
            .exec()
        : await q;
      if (existing) {
        const refs = await this.hydrateAssignmentRefs([existing]);
        return this.formatAssignment(existing, false, refs);
      }
    }

    let exerciseTitle = '';
    let exerciseVersion = 1;
    let exerciseSnapshot: any = null;

    const exercise = await this.exerciseModel
      .findById(targetExerciseId)
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    let examTest: any = null;
    if (exercise) {
      exerciseTitle = exercise.title;
      exerciseVersion = exercise.version;
      exerciseSnapshot = {
        title: exercise.title,
        type: exercise.type,
        passage: exercise.passage,
        audioAssets: exercise.audioAssets,
        questions: exercise.questions as any,
        passScore: exercise.passScore,
        version: exercise.version,
      };
    } else if (this.examTestModel) {
      examTest = await this.examTestModel.findById(targetExerciseId).exec();
      if (!examTest) {
        throw new NotFoundException('Exercise not found');
      }
      exerciseTitle = examTest.title;
      exerciseVersion = examTest.version;

      let partsToInclude = examTest.parts || [];
      if (dto.requiredScope === 'PART' && dto.requiredPartId) {
        partsToInclude = partsToInclude.filter(
          (p: any) => extractObjectId(p._id) === dto.requiredPartId,
        );
      }

      const questions: any[] = [];
      const selectedGroupSet = dto.selectedQuestionGroupIds && dto.selectedQuestionGroupIds.length > 0
        ? new Set(dto.selectedQuestionGroupIds)
        : null;

      for (const part of partsToInclude) {
        for (const group of part.questionGroups || []) {
          if (selectedGroupSet && !selectedGroupSet.has(extractObjectId(group._id))) {
            continue;
          }
          for (const q of group.questions || []) {
            questions.push(q);
          }
        }
      }

      const passage = partsToInclude
        .map((p: any) => p.contentHtml || p.passage)
        .filter(Boolean)
        .join('\n\n');

      exerciseSnapshot = {
        title: examTest.title,
        type: examTest.skill.toLowerCase() as any,
        passage,
        questions,
        passScore: examTest.passScore,
        version: examTest.version,
      };
    }

    // Custom question groups override if provided
    if (dto.customQuestionGroups && dto.customQuestionGroups.length > 0) {
      const customQuestions: any[] = [];
      for (const group of dto.customQuestionGroups) {
        for (const q of group.questions || []) {
          customQuestions.push(q);
        }
      }
      exerciseSnapshot = {
        title: dto.title || exerciseTitle,
        type: exerciseSnapshot?.type || 'reading',
        questions: customQuestions,
        passScore: dto.targetScorePercent ?? 70,
        version: 1,
      };
    }

    // 3. Determine availableAt & dueAt (openAt & deadlineAt)
    let openAt: Date;
    let deadlineAt: Date;
    let assignedDate: string;

    if (dto.assignedDate) {
      const bounds = createVnDailyAssignmentBounds(dto.assignedDate);
      openAt = bounds.availableAt;
      deadlineAt = bounds.dueAt;
      assignedDate = bounds.assignedDate;
    } else if (dto.targetDate) {
      const bounds = createVnDailyAssignmentBounds(dto.targetDate);
      openAt = bounds.availableAt;
      deadlineAt = bounds.dueAt;
      assignedDate = bounds.assignedDate;
    } else if (dto.openAt && (dto.deadlineAt || dto.dueAt)) {
      openAt = new Date(dto.openAt);
      deadlineAt = new Date((dto.deadlineAt || dto.dueAt)!);
      assignedDate = formatVnDateTime(openAt).slice(0, 10);
    } else if (dto.openAt && !dto.deadlineAt && !dto.dueAt) {
      openAt = new Date(dto.openAt);
      const bounds = createVnDailyAssignmentBounds(openAt);
      deadlineAt = bounds.dueAt;
      assignedDate = bounds.assignedDate;
    } else if (!dto.openAt && (dto.deadlineAt || dto.dueAt)) {
      deadlineAt = new Date((dto.deadlineAt || dto.dueAt)!);
      const bounds = createVnDailyAssignmentBounds(deadlineAt);
      openAt = bounds.availableAt;
      assignedDate = bounds.assignedDate;
    } else {
      const bounds = createVnDailyAssignmentBounds();
      openAt = bounds.availableAt;
      deadlineAt = bounds.dueAt;
      assignedDate = bounds.assignedDate;
    }

    // 4. Duplicate daily assignment check for same course, exercise and openAt
    if (typeof this.assignmentModel.findOne === 'function') {
      const q = this.assignmentModel.findOne({
        courseId: course._id,
        exerciseId: new Types.ObjectId(targetExerciseId),
        openAt,
        status: { $nin: [AssignmentStatus.ARCHIVED, AssignmentStatus.CLOSED] },
      });
      const duplicate = q?.populate
        ? await q
            .populate('courseId', 'code title')
            .populate('examTestId', 'title skill passScore')
            .exec()
        : await q;

      if (duplicate) {
        const refs = await this.hydrateAssignmentRefs([duplicate]);
        return this.formatAssignment(duplicate, false, refs);
      }
    }

    // 5. Determine status
    const now = new Date();
    let status: AssignmentStatus;
    if (dto.action === 'draft' || dto.status === AssignmentStatus.DRAFT) {
      status = AssignmentStatus.DRAFT;
    } else if (dto.action === 'schedule' || dto.status === AssignmentStatus.SCHEDULED) {
      status = AssignmentStatus.SCHEDULED;
    } else if (dto.action === 'publish' || dto.status === AssignmentStatus.PUBLISHED) {
      status = AssignmentStatus.PUBLISHED;
    } else if (dto.assignedDate && now.getTime() < openAt.getTime()) {
      status = AssignmentStatus.SCHEDULED;
    } else if (now.getTime() < openAt.getTime() && !dto.targetDate) {
      status = AssignmentStatus.SCHEDULED;
    } else {
      status = AssignmentStatus.PUBLISHED;
    }

    const assignment = new this.assignmentModel({
      courseId: course._id,
      exerciseId: new Types.ObjectId(targetExerciseId),
      ...(examTest ? { examTestId: examTest._id } : {}),
      exerciseVersion,
      exerciseSnapshot,
      assignedBy: actor._id,
      title: dto.title || exerciseTitle,
      openAt,
      deadlineAt,
      assignedDate,
      selectedQuestionGroupIds: dto.selectedQuestionGroupIds || [],
      targetScorePercent: dto.targetScorePercent ?? 70,
      idempotencyKey: dto.idempotencyKey,
      allowRetake:
        dto.allowRetake !== undefined
          ? dto.allowRetake
          : dto.maxAttempts !== undefined && dto.maxAttempts !== null
            ? dto.maxAttempts > 1
            : true,
      maxAttempts: dto.maxAttempts,
      requiredScope: dto.requiredScope || 'FULL',
      requiredPartId: dto.requiredPartId,
      allowedModes: dto.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: dto.durationSecondsOverride,
      status,
    });

    let dispatchedEnrollments: any[] = [];
    try {
      await this.runInTransaction(async (session) => {
        await assignment.save(session ? { session } : undefined);

        // If published or scheduled, dispatch student assignments for all actively enrolled students
        if (status !== AssignmentStatus.DRAFT) {
          dispatchedEnrollments = await this.dispatchStudentAssignmentsInternal(assignment, session);
        }
      });
    } catch (err: any) {
      if (err?.code === 11000 && dto.idempotencyKey && typeof this.assignmentModel.findOne === 'function') {
        const q = this.assignmentModel.findOne({ idempotencyKey: dto.idempotencyKey });
        const existing = q?.populate
          ? await q
              .populate('courseId', 'code title')
              .populate('examTestId', 'title skill passScore')
              .exec()
          : await q;
        if (existing) {
          const refs = await this.hydrateAssignmentRefs([existing]);
          return this.formatAssignment(existing, false, refs);
        }
      }
      throw err;
    }

    if (this.auditService) {
      this.auditService
        .log({
          action: 'ASSIGNMENT_CREATED',
          entityType: 'Assignment',
          entityId: assignment._id,
          actorId: actor._id,
          metadata: { title: assignment.title, status: assignment.status },
        })
        .catch((err) => this.logger.warn(`Failed to audit assignment: ${err.message}`));
    }

    if (dispatchedEnrollments.length > 0) {
      this.notifyDispatchedStudents(assignment, dispatchedEnrollments);
    }

    const exerciseMap = new Map<string, any>();
    const examTestMap = new Map<string, any>();
    if (exercise) {
      exerciseMap.set(extractObjectId(exercise._id), exercise);
    }
    if (examTest) {
      examTestMap.set(extractObjectId(examTest._id), examTest);
    }

    return this.formatAssignment(assignment, true, { exerciseMap, examTestMap });
  }

  async findAll(actor: UserDocument, query: AssignmentQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = {};

    if (actor.role === UserRole.TEACHER) {
      const teacherCourses = await this.courseModel
        .find({ teacherId: actor._id })
        .select('_id')
        .exec();
      const teacherCourseIds = teacherCourses.map((c) => c._id);

      if (query.courseId) {
        if (!Types.ObjectId.isValid(query.courseId)) {
          throw new BadRequestException('Invalid courseId');
        }
        const hasAccess = teacherCourseIds.some((id) => id.toHexString() === query.courseId);
        if (!hasAccess) {
          throw new ForbiddenException('You do not teach this course');
        }
        filter.courseId = new Types.ObjectId(query.courseId);
      } else {
        filter.courseId = { $in: teacherCourseIds };
      }
    } else if (actor.role === UserRole.ADMIN) {
      if (query.courseId) {
        if (!Types.ObjectId.isValid(query.courseId)) {
          throw new BadRequestException('Invalid courseId');
        }
        filter.courseId = new Types.ObjectId(query.courseId);
      }
    } else {
      throw new ForbiddenException('Students must view their assignments via /assignments/mine');
    }

    if (query.status) {
      filter.status = query.status;
    }

    if (query.assignedDate) {
      const trimmedDate = query.assignedDate.trim();
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedDate)) {
        const bounds = createVnDailyBounds(trimmedDate);
        filter.$or = [
          { assignedDate: trimmedDate },
          {
            assignedDate: { $in: [null, ''] },
            openAt: { $gte: bounds.openAt, $lte: bounds.deadlineAt },
          },
        ];
      } else {
        filter.assignedDate = trimmedDate;
      }
    }

    if (query.from || query.to) {
      if (query.from) {
        filter.openAt = { ...(filter.openAt || {}), $gte: new Date(query.from) };
      }
      if (query.to) {
        filter.deadlineAt = { ...(filter.deadlineAt || {}), $lte: new Date(query.to) };
      }
    }

    const [docs, total] = await Promise.all([
      this.assignmentModel
        .find(filter)
        .populate('courseId', 'code title')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.assignmentModel.countDocuments(filter).exec(),
    ]);

    const refs = await this.hydrateAssignmentRefs(docs);

    return {
      items: docs.map((d) => this.formatAssignment(d, false, refs)),
      total,
      page,
      limit,
    };
  }

  async findMine(student: UserDocument, query: AssignmentQueryDto) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can view their personal assignments list');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    // Ensure active enrollments have student assignments dispatched
    try {
      const activeEnrollments = await this.enrollmentModel
        .find({
          studentId: student._id,
          status: EnrollmentStatus.ACTIVE,
        })
        .select('courseId')
        .exec();

      if (activeEnrollments.length > 0) {
        const activeCourseIds = activeEnrollments.map((e) => e.courseId);
        const nonDraftAssignments = await this.assignmentModel
          .find({
            courseId: { $in: activeCourseIds },
            status: { $in: [AssignmentStatus.PUBLISHED, AssignmentStatus.SCHEDULED, AssignmentStatus.AVAILABLE] },
          })
          .select('_id deadlineAt')
          .exec();

        if (nonDraftAssignments.length > 0) {
          const existingSAs = await this.studentAssignmentModel
            .find({
              studentId: student._id,
              assignmentId: { $in: nonDraftAssignments.map((a) => a._id) },
            })
            .select('assignmentId')
            .exec();

          const existingSet = new Set(existingSAs.map((sa) => sa.assignmentId.toString()));
          const missing = nonDraftAssignments.filter((a) => !existingSet.has(a._id.toString()));

          if (missing.length > 0) {
            const toInsert = missing.map((a) => ({
              assignmentId: a._id,
              studentId: student._id,
              originalDeadlineAt: a.deadlineAt,
              effectiveDeadlineAt: a.deadlineAt,
              status: StudentAssignmentStatus.NOT_STARTED,
            }));
            await this.studentAssignmentModel.insertMany(toInsert, { ordered: false });
          }
        }
      }
    } catch (backfillErr: any) {
      this.logger.warn(`findMine on-the-fly backfill failed: ${backfillErr.message}`);
    }

    const saFilter: Record<string, any> = {
      studentId: student._id,
    };

    const studentAssignments = await this.studentAssignmentModel
      .find(saFilter)
      .populate({
        path: 'assignmentId',
        select: '-exerciseSnapshot',
        populate: [
          { path: 'courseId', select: 'code title' },
          { path: 'examTestId', select: 'title skill passScore' },
        ],
      })
      .sort({ createdAt: -1 })
      .exec();

    // Filter out drafts or nulls
    let filtered = studentAssignments.filter(
      (sa) => sa.assignmentId != null && (sa.assignmentId as any).status !== AssignmentStatus.DRAFT,
    );

    if (query.courseId) {
      filtered = filtered.filter(
        (sa: any) =>
          extractObjectId(sa.assignmentId.courseId?._id || sa.assignmentId.courseId) ===
          query.courseId,
      );
    }

    if (query.assignedDate) {
      filtered = filtered.filter((sa: any) => {
        const asgDate =
          sa.assignmentId.assignedDate ||
          (sa.assignmentId.openAt ? formatVnDateTime(sa.assignmentId.openAt).slice(0, 10) : '');
        return asgDate === query.assignedDate;
      });
    }

    if (query.status) {
      const qStatus = String(query.status).toLowerCase();
      filtered = filtered.filter((sa: any) => {
        const studentLifecycle = computeStudentAssignmentLifecycleStatus(sa.assignmentId, sa, new Date());
        return (
          sa.status === query.status ||
          sa.assignmentId.status === query.status ||
          studentLifecycle.scheduleStatus.toLowerCase() === qStatus ||
          studentLifecycle.status.toLowerCase() === qStatus
        );
      });
    }

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const now = new Date();
    const saIds = paginated.map((sa: any) => sa._id);
    const attemptsCountMap: Record<string, number> = {};
    if (this.submissionModel && saIds.length > 0) {
      try {
        const counts = await this.submissionModel.aggregate([
          { $match: { studentAssignmentId: { $in: saIds } } },
          { $group: { _id: '$studentAssignmentId', count: { $sum: 1 } } },
        ]);
        for (const item of counts) {
          attemptsCountMap[extractObjectId(item._id)] = item.count;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to aggregate submission counts in findMine: ${err?.message}`);
      }
    }

    const refs = await this.hydrateAssignmentRefs(paginated.map((sa: any) => sa.assignmentId));

    const items = paginated.map((sa: any) => {
      const assignment = sa.assignmentId;
      const asgIdStr = extractObjectId(assignment._id);
      const saIdStr = extractObjectId(sa._id);
      const actualAttempts =
        attemptsCountMap[saIdStr] ??
        sa.attemptsCount ??
        (sa.lastSubmittedAt ? 1 : 0);
      const rawSaForLifecycle = {
        ...(typeof sa.toObject === 'function' ? sa.toObject() : sa),
        attemptsCount: actualAttempts,
      };
      const studentLifecycle = computeStudentAssignmentLifecycleStatus(assignment, rawSaForLifecycle, now);
      const isPassed = Boolean(
        sa.isTargetAchieved ||
        sa.status === StudentAssignmentStatus.PASSED ||
        sa.status === 'passed' ||
        (sa.bestScore !== undefined && sa.bestScore !== null && sa.bestScore >= (assignment.targetScorePercent ?? 70)),
      );
      const meta = this.resolveAssignmentMediaMeta(
        typeof assignment.toObject === 'function' ? assignment.toObject() : assignment,
        refs,
      );
      const exType = meta.exerciseType;
      const isReadingEx = String(exType).toLowerCase() === 'reading';

      return {
        id: asgIdStr,
        _id: asgIdStr,
        studentAssignmentId: saIdStr,
        assignmentId: asgIdStr,
        examTestId: meta.examTestId,
        exerciseId: meta.exerciseId,
        requiredScope: assignment.requiredScope,
        requiredPartId: assignment.requiredPartId,
        durationSecondsOverride: assignment.durationSecondsOverride,
        title: assignment.title,
        course: assignment.courseId
          ? {
              id: extractObjectId(assignment.courseId._id || assignment.courseId),
              code: assignment.courseId.code,
              title: assignment.courseId.title,
            }
          : undefined,
        exercise: meta.exercise,
        assignedDate: assignment.assignedDate || formatVnDateTime(assignment.openAt).slice(0, 10),
        targetScorePercent: assignment.targetScorePercent ?? 70,
        openAt: assignment.openAt,
        openAtVn: formatVnDateTime(assignment.openAt),
        availableAt: assignment.openAt,
        availableAtVn: formatVnDateTime(assignment.openAt),
        deadlineAt: assignment.deadlineAt,
        deadlineAtVn: formatVnDateTime(assignment.deadlineAt),
        dueAt: assignment.deadlineAt,
        dueAtVn: formatVnDateTime(assignment.deadlineAt),
        effectiveDeadlineAt: sa.effectiveDeadlineAt,
        effectiveDeadlineAtVn: formatVnDateTime(sa.effectiveDeadlineAt),
        courseId: assignment.courseId ? extractObjectId(assignment.courseId._id || assignment.courseId) : '',
        courseTitle: assignment.courseId?.title || '',
        exerciseType: exType,
        effectiveDueAt: sa.effectiveDeadlineAt || assignment.deadlineAt,
        passed: isPassed,
        attemptsCount: actualAttempts,
        answerReviewUnlocked: isPassed,
        translationAvailable: Boolean(isPassed && isReadingEx),
        translationStatus: sa.translationStatus || 'not_started',
        penaltyApplied: Boolean(sa.penaltyAppliedAt),
        status: isPassed ? StudentAssignmentStatus.PASSED : sa.status,
        scheduleStatus: studentLifecycle.scheduleStatus,
        isAvailable: studentLifecycle.isAvailable,
        remainingSeconds: studentLifecycle.remainingSeconds,
        bestScore: sa.bestScore,
        isTargetAchieved: isPassed,
        passedAt: sa.passedAt,
        lastSubmittedAt: sa.lastSubmittedAt,
        allowRetake: assignment.allowRetake,
        maxAttempts: assignment.maxAttempts,
      };
    });

    return {
      items,
      total,
      page,
      limit,
    };
  }

  async findById(id: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(id)
      .select('+exerciseSnapshot')
      .populate('courseId', 'code title teacherId status')
      .populate('examTestId', 'title skill passScore')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course: any = assignment.courseId;

    if (actor.role === UserRole.ADMIN) {
      const refs = await this.hydrateAssignmentRefs([assignment]);
      return this.formatAssignment(assignment, true, refs);
    }

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
      const refs = await this.hydrateAssignmentRefs([assignment]);
      return this.formatAssignment(assignment, true, refs);
    }

    // Role is STUDENT:
    if (assignment.status === AssignmentStatus.DRAFT) {
      throw new NotFoundException('Assignment not found');
    }

    const studentAssignment = await this.studentAssignmentModel
      .findOne({
        assignmentId: assignment._id,
        studentId: actor._id,
      })
      .exec();

    if (!studentAssignment) {
      throw new ForbiddenException('You are not assigned to this assignment');
    }

    const refs = await this.hydrateAssignmentRefs([assignment]);
    return this.formatAssignmentForStudent(assignment, studentAssignment, refs);
  }

  async update(id: string, dto: UpdateAssignmentDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot update assignments');
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel.findById(id).exec();
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course = await this.courseModel.findById(assignment.courseId).exec();
    if (!course) {
      throw new NotFoundException('Course not found');
    }

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    if (dto.title !== undefined) {
      assignment.title = dto.title;
    }
    if (dto.allowRetake !== undefined) {
      assignment.allowRetake = dto.allowRetake;
    }
    if (dto.maxAttempts !== undefined) {
      assignment.maxAttempts = dto.maxAttempts;
    }
    if (dto.targetScorePercent !== undefined) {
      assignment.targetScorePercent = dto.targetScorePercent;
    }
    if (dto.selectedQuestionGroupIds !== undefined) {
      assignment.selectedQuestionGroupIds = dto.selectedQuestionGroupIds;
    }
    if (dto.durationSecondsOverride !== undefined) {
      assignment.durationSecondsOverride = dto.durationSecondsOverride;
    }

    let datesModified = false;
    let newOpenAt = assignment.openAt;
    let newDeadlineAt = assignment.deadlineAt;
    const oldDeadline = assignment.deadlineAt;

    if (dto.assignedDate) {
      const bounds = createVnDailyAssignmentBounds(dto.assignedDate);
      newOpenAt = bounds.availableAt;
      newDeadlineAt = bounds.dueAt;
      assignment.assignedDate = bounds.assignedDate;
      datesModified = true;
    } else {
      if (dto.openAt) {
        newOpenAt = new Date(dto.openAt);
        datesModified = true;
      }
      const deadlineInput = dto.deadlineAt || dto.dueAt;
      if (deadlineInput) {
        newDeadlineAt = new Date(deadlineInput);
        datesModified = true;
      }
    }

    if (datesModified) {
      if (newOpenAt.getTime() >= newDeadlineAt.getTime()) {
        throw new BadRequestException('openAt must be earlier than deadlineAt');
      }
      assignment.openAt = newOpenAt;
      assignment.deadlineAt = newDeadlineAt;

      // Update student assignments whose deadline was synced with the assignment deadline
      if (oldDeadline && newDeadlineAt.getTime() !== oldDeadline.getTime()) {
        await this.studentAssignmentModel.updateMany(
          {
            assignmentId: assignment._id,
            effectiveDeadlineAt: oldDeadline,
          },
          {
            $set: { effectiveDeadlineAt: newDeadlineAt },
          },
        );
      }
    }

    const prevStatus = assignment.status;
    let targetStatus = dto.status;
    if (dto.action === 'publish') {
      targetStatus = AssignmentStatus.PUBLISHED;
    } else if (dto.action === 'schedule') {
      targetStatus = AssignmentStatus.SCHEDULED;
    } else if (dto.action === 'draft') {
      targetStatus = AssignmentStatus.DRAFT;
    }

    if (targetStatus && targetStatus !== prevStatus) {
      assignment.status = targetStatus;
      if (
        prevStatus === AssignmentStatus.DRAFT &&
        (targetStatus === AssignmentStatus.PUBLISHED ||
          targetStatus === AssignmentStatus.SCHEDULED ||
          targetStatus === AssignmentStatus.AVAILABLE)
      ) {
        await this.dispatchStudentAssignments(assignment);
      }
    }

    await assignment.save();
    const refs = await this.hydrateAssignmentRefs([assignment]);
    return this.formatAssignment(assignment, true, refs);
  }

  async getStudents(assignmentId: string, actor: UserDocument, page = 1, limit = 20) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot view assignment rosters');
    }

    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course = await this.courseModel.findById(assignment.courseId).exec();
    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));

    const [docs, total] = await Promise.all([
      this.studentAssignmentModel
        .find({ assignmentId: assignment._id })
        .populate('studentId', 'fullName name email avatar status')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .exec(),
      this.studentAssignmentModel.countDocuments({ assignmentId: assignment._id }).exec(),
    ]);

    const saIds = docs.map((d: any) => d._id);

    const attemptsCountMap: Record<string, number> = {};
    if (this.submissionModel && saIds.length > 0) {
      try {
        const counts = await this.submissionModel.aggregate([
          { $match: { studentAssignmentId: { $in: saIds } } },
          { $group: { _id: '$studentAssignmentId', count: { $sum: 1 } } },
        ]);
        for (const item of counts) {
          attemptsCountMap[extractObjectId(item._id)] = item.count;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to aggregate submission counts: ${err?.message}`);
      }
    }

    const translationStatusMap: Record<string, string> = {};
    if (this.translationModel && saIds.length > 0) {
      try {
        const translations = await this.translationModel
          .find({
            $or: [
              { studentAssignmentId: { $in: saIds } },
              { assignmentId: assignment._id },
            ],
          })
          .select('studentId studentAssignmentId status')
          .exec();
        for (const tr of translations) {
          const sId = tr.studentId ? extractObjectId(tr.studentId) : '';
          const saId = tr.studentAssignmentId ? extractObjectId(tr.studentAssignmentId) : '';
          const trStatus = tr.status || 'not_started';
          if (saId) translationStatusMap[saId] = trStatus;
          if (sId) translationStatusMap[sId] = trStatus;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to query translations: ${err?.message}`);
      }
    }

    const refs = await this.hydrateAssignmentRefs([assignment]);
    const asg = assignment as any;
    const rawAsg = typeof asg.toObject === 'function' ? asg.toObject() : asg;
    const mediaMeta = this.resolveAssignmentMediaMeta(rawAsg, refs);
    const passThreshold = asg.targetScorePercent ?? asg.passScore ?? 70;

    const items = docs.map((doc: any) => {
      const saIdStr = extractObjectId(doc._id);
      const studentUser = doc.studentId;
      const studentIdStr = studentUser ? extractObjectId(studentUser._id || studentUser) : '';
      const studentName = studentUser?.fullName || studentUser?.name || 'Học viên';
      const studentEmail = studentUser?.email || '';

      const attemptsCount =
        attemptsCountMap[saIdStr] ??
        doc.attemptsCount ??
        (doc.lastSubmittedAt ? 1 : 0);

      const effectiveDueAt = doc.effectiveDeadlineAt || doc.originalDeadlineAt || asg.deadlineAt;
      const isPassed = Boolean(
        doc.isTargetAchieved ||
        doc.status === StudentAssignmentStatus.PASSED ||
        (doc.bestScore !== undefined && doc.bestScore !== null && doc.bestScore >= passThreshold),
      );

      const trStatus =
        translationStatusMap[saIdStr] ||
        translationStatusMap[studentIdStr] ||
        doc.translationStatus ||
        'not_started';

      return {
        id: saIdStr,
        _id: saIdStr,
        studentAssignmentId: saIdStr,
        assignmentId: extractObjectId(asg._id),
        examTestId: mediaMeta.examTestId,
        exerciseId: mediaMeta.exerciseId,
        courseId: extractObjectId(asg.courseId),
        courseTitle: course?.title || '',
        studentId: studentIdStr,
        studentName,
        studentEmail,
        student: studentUser
          ? {
              id: studentIdStr,
              name: studentName,
              fullName: studentName,
              email: studentEmail,
              avatar: studentUser.avatar,
              status: studentUser.status,
            }
          : undefined,
        title: asg.title,
        exerciseType: mediaMeta.exerciseType,
        assignedDate: asg.assignedDate || (asg.openAt ? formatVnDateTime(asg.openAt).slice(0, 10) : ''),
        openAt: asg.openAt,
        dueAt: asg.deadlineAt,
        originalDeadlineAt: doc.originalDeadlineAt,
        originalDeadlineAtVn: doc.originalDeadlineAt ? formatVnDateTime(doc.originalDeadlineAt) : undefined,
        effectiveDeadlineAt: doc.effectiveDeadlineAt,
        effectiveDeadlineAtVn: formatVnDateTime(doc.effectiveDeadlineAt),
        effectiveDueAt,
        timezone: asg.timezone || 'Asia/Ho_Chi_Minh',
        status: doc.status,
        attemptsCount,
        bestScore: doc.bestScore ?? null,
        passed: isPassed,
        answerReviewUnlocked: isPassed,
        translationAvailable: Boolean(mediaMeta.exerciseType === 'reading'),
        translationStatus: trStatus,
        penaltyApplied: Boolean(doc.penaltyAppliedAt),
        passedAt: doc.passedAt,
        lastSubmittedAt: doc.lastSubmittedAt,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    });

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum) || 1,
    };
  }

  async backfillStudents(assignmentId: string, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot trigger assignment backfill');
    }

    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel.findById(assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course = await this.courseModel.findById(assignment.courseId).exec();
    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    const activeEnrollments = await this.enrollmentModel
      .find({
        courseId: assignment.courseId,
        status: EnrollmentStatus.ACTIVE,
      })
      .exec();

    const existingRecords = await this.studentAssignmentModel
      .find({ assignmentId: assignment._id })
      .select('studentId')
      .exec();

    const existingStudentIds = new Set(
      existingRecords.map((r) => extractObjectId(r.studentId)),
    );

    const missingEnrollments = activeEnrollments.filter(
      (e) => !existingStudentIds.has(extractObjectId(e.studentId)),
    );

    if (missingEnrollments.length > 0) {
      const toInsert = missingEnrollments.map((enr) => ({
        assignmentId: assignment._id,
        studentId: enr.studentId,
        originalDeadlineAt: assignment.deadlineAt,
        effectiveDeadlineAt: assignment.deadlineAt,
        status: StudentAssignmentStatus.NOT_STARTED,
      }));
      await this.studentAssignmentModel.insertMany(toInsert, { ordered: false });
    }

    return {
      assignmentId: extractObjectId(assignment._id),
      backfilledCount: missingEnrollments.length,
      totalStudents: existingStudentIds.size + missingEnrollments.length,
    };
  }

  private async dispatchStudentAssignments(
    assignment: AssignmentDocument,
    session?: any,
  ): Promise<number> {
    const activeEnrollments = await this.dispatchStudentAssignmentsInternal(assignment, session);
    if (activeEnrollments.length > 0) {
      this.notifyDispatchedStudents(assignment, activeEnrollments);
    }
    return activeEnrollments.length;
  }

  private async dispatchStudentAssignmentsInternal(
    assignment: AssignmentDocument,
    session?: any,
  ): Promise<any[]> {
    const rawCourseId = assignment.courseId;
    const courseIdObj =
      typeof rawCourseId === 'string'
        ? new Types.ObjectId(rawCourseId)
        : (rawCourseId as Types.ObjectId);
    const enrollmentQuery = this.enrollmentModel.find({
      courseId: { $in: [courseIdObj, courseIdObj.toHexString()] },
      status: EnrollmentStatus.ACTIVE,
    });
    const activeEnrollments = await this.execWithOptionalSession<any[]>(enrollmentQuery, session);

    if (!activeEnrollments || activeEnrollments.length === 0) return [];

    const toInsert = activeEnrollments.map((enr) => ({
      assignmentId: assignment._id,
      studentId: enr.studentId,
      originalDeadlineAt: assignment.deadlineAt,
      effectiveDeadlineAt: assignment.deadlineAt,
      status: StudentAssignmentStatus.NOT_STARTED,
    }));

    const insertOptions = session ? { ordered: false, session } : { ordered: false };

    try {
      await this.studentAssignmentModel.insertMany(toInsert, insertOptions);
      return activeEnrollments;
    } catch (err: any) {
      // Ignore duplicate key error (code 11000) for idempotency
      if (err.code === 11000 || (err.writeErrors && err.writeErrors.length > 0)) {
        return [];
      }
      throw err;
    }
  }

  private notifyDispatchedStudents(assignment: AssignmentDocument, activeEnrollments: any[]): void {
    if (!this.notificationsService) return;
    for (const enr of activeEnrollments) {
      this.notificationsService
        .create({
          userId: enr.studentId.toString(),
          type: NotificationType.NEW_ASSIGNMENT,
          title: `Bài tập mới: ${assignment.title}`,
          body: `Bạn có bài tập mới cần hoàn thành trước ${formatVnDateTime(assignment.deadlineAt)}.`,
          payload: {
            assignmentId: assignment._id.toString(),
            courseId: assignment.courseId.toString(),
            title: assignment.title,
            deadlineAt: assignment.deadlineAt.toISOString(),
            deadlineAtVn: formatVnDateTime(assignment.deadlineAt),
          },
          sendEmail: true,
          emailTemplateKey: 'assignment-published',
        })
        .catch((err) => this.logger.warn(`Failed to notify student ${enr.studentId}: ${err.message}`));
    }
  }

  private formatAssignment(
    assignment: any,
    includeSnapshot = false,
    refs?: { exerciseMap: Map<string, any>; examTestMap: Map<string, any> },
  ) {
    const raw = typeof assignment.toObject === 'function' ? assignment.toObject() : assignment;
    const courseObj =
      raw.courseId && typeof raw.courseId === 'object' && raw.courseId._id
        ? {
            id: extractObjectId(raw.courseId._id),
            code: raw.courseId.code,
            title: raw.courseId.title,
          }
        : undefined;
    const courseIdStr = courseObj ? courseObj.id : extractObjectId(raw.courseId);

    const meta = this.resolveAssignmentMediaMeta(raw, refs);
    const exerciseObj = meta.exercise
      ? {
          id: meta.exercise.id,
          title: meta.exercise.title,
          type: meta.exercise.type,
        }
      : undefined;

    const now = new Date();
    const lifecycleStatus = computeAssignmentLifecycleStatus(raw, now);
    const idStr = extractObjectId(raw._id || raw.id);

    const res: any = {
      id: idStr,
      _id: idStr,
      courseId: courseIdStr,
      course: courseObj,
      courseTitle: raw.courseTitle || courseObj?.title || '',
      exerciseId: meta.exerciseId,
      ...(meta.examTestId ? { examTestId: meta.examTestId } : {}),
      exercise: exerciseObj,
      exerciseTitle: raw.exerciseTitle || exerciseObj?.title || raw.title || '',
      exerciseType: meta.exerciseType,
      exerciseVersion: raw.exerciseVersion,
      assignedBy: extractObjectId(raw.assignedBy),
      title: raw.title,
      requiredScope: raw.requiredScope || 'FULL',
      requiredPartId: raw.requiredPartId || null,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: raw.durationSecondsOverride || null,
      assignedDate: raw.assignedDate || formatVnDateTime(raw.openAt).slice(0, 10),
      selectedQuestionGroupIds: raw.selectedQuestionGroupIds || [],
      targetScorePercent: raw.targetScorePercent ?? raw.passThreshold ?? 70,
      passThreshold: raw.passThreshold ?? raw.targetScorePercent ?? 70,
      openAt: raw.openAt,
      openAtVn: formatVnDateTime(raw.openAt),
      availableAt: raw.openAt,
      availableAtVn: formatVnDateTime(raw.openAt),
      deadlineAt: raw.deadlineAt,
      deadlineAtVn: formatVnDateTime(raw.deadlineAt),
      dueAt: raw.deadlineAt,
      dueAtVn: formatVnDateTime(raw.deadlineAt),
      allowRetake: raw.allowRetake,
      maxAttempts: raw.maxAttempts,
      status: lifecycleStatus.toLowerCase(),
      rawStatus: raw.status,
      scheduleStatus: lifecycleStatus,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };

    if (includeSnapshot && raw.exerciseSnapshot) {
      res.exerciseSnapshot = raw.exerciseSnapshot;
    }

    return res;
  }

  private formatAssignmentForStudent(
    assignment: any,
    studentAssignment: any,
    refs?: { exerciseMap: Map<string, any>; examTestMap: Map<string, any> },
  ) {
    const raw = typeof assignment.toObject === 'function' ? assignment.toObject() : assignment;
    const rawSa =
      typeof studentAssignment.toObject === 'function'
        ? studentAssignment.toObject()
        : studentAssignment;

    const now = new Date();
    const studentLifecycle = computeStudentAssignmentLifecycleStatus(raw, rawSa, now);

    let sanitizedExercise: any = undefined;
    // CRITICAL: Students must NOT access protected questions/passages before availableAt!
    const isLocked =
      studentLifecycle.scheduleStatus === 'SCHEDULED' ||
      now.getTime() < new Date(raw.openAt).getTime();

    if (!isLocked && raw.exerciseSnapshot) {
      sanitizedExercise = ExerciseMapper.toSanitized(raw.exerciseSnapshot);
    } else if (raw.exerciseSnapshot) {
      sanitizedExercise = {
        title: raw.exerciseSnapshot.title,
        type: raw.exerciseSnapshot.type,
        passScore: raw.exerciseSnapshot.passScore,
        questionCount: raw.exerciseSnapshot.questions?.length || 0,
      };
    }

    const idStr = extractObjectId(raw._id || raw.id);
    const saIdStr = extractObjectId(rawSa._id || rawSa.id);
    const courseObj =
      raw.courseId && typeof raw.courseId === 'object' && raw.courseId._id
        ? {
            id: extractObjectId(raw.courseId._id),
            code: raw.courseId.code,
            title: raw.courseId.title,
          }
        : undefined;
    const courseIdStr = courseObj ? courseObj.id : extractObjectId(raw.courseId);

    const meta = this.resolveAssignmentMediaMeta(raw, refs);

    return {
      id: idStr,
      _id: idStr,
      assignmentId: idStr,
      studentAssignmentId: saIdStr,
      courseId: courseIdStr,
      course: courseObj,
      courseTitle: raw.courseTitle || courseObj?.title || '',
      exerciseId: meta.exerciseId,
      ...(meta.examTestId ? { examTestId: meta.examTestId } : {}),
      exercise: sanitizedExercise,
      exerciseTitle: raw.exerciseTitle || meta.exercise?.title || raw.title || '',
      exerciseType: meta.exerciseType,
      exerciseVersion: raw.exerciseVersion,
      title: raw.title,
      requiredScope: raw.requiredScope || 'FULL',
      requiredPartId: raw.requiredPartId || null,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: raw.durationSecondsOverride || null,
      assignedDate: raw.assignedDate || formatVnDateTime(raw.openAt).slice(0, 10),
      targetScorePercent: raw.targetScorePercent ?? raw.passThreshold ?? 70,
      passThreshold: raw.passThreshold ?? raw.targetScorePercent ?? 70,
      openAt: raw.openAt,
      openAtVn: formatVnDateTime(raw.openAt),
      availableAt: raw.openAt,
      availableAtVn: formatVnDateTime(raw.openAt),
      deadlineAt: raw.deadlineAt,
      deadlineAtVn: formatVnDateTime(raw.deadlineAt),
      dueAt: raw.deadlineAt,
      dueAtVn: formatVnDateTime(raw.deadlineAt),
      effectiveDeadlineAt: rawSa.effectiveDeadlineAt,
      effectiveDeadlineAtVn: formatVnDateTime(rawSa.effectiveDeadlineAt),
      allowRetake: raw.allowRetake,
      maxAttempts: raw.maxAttempts,
      assignmentStatus: raw.status,
      myStatus: rawSa.status,
      status: studentLifecycle.scheduleStatus,
      scheduleStatus: studentLifecycle.scheduleStatus,
      isAvailable: studentLifecycle.isAvailable,
      remainingSeconds: studentLifecycle.remainingSeconds,
      bestScore: rawSa.bestScore,
      isTargetAchieved: rawSa.isTargetAchieved ?? false,
      passedAt: rawSa.passedAt,
      lastSubmittedAt: rawSa.lastSubmittedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

