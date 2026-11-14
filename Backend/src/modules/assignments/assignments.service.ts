import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assignment, AssignmentDocument, ExerciseSnapshot } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Exercise, ExerciseDocument } from 'src/database/schemas/exercise.schema';
import { ExamTest, ExamTestDocument } from 'src/database/schemas/exam-test.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
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
  if (ref instanceof Types.ObjectId) {
    return ref.toHexString();
  }
  if (ref && typeof ref === 'object' && '_id' in ref) {
    const id = (ref as { _id: unknown })._id;
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

  const isCompleted =
    studentAssignment.status === StudentAssignmentStatus.PASSED ||
    studentAssignment.status === StudentAssignmentStatus.SUBMITTED ||
    studentAssignment.status === StudentAssignmentStatus.COMPLETED;

  if (isCompleted) {
    return {
      status: studentAssignment.status || 'completed',
      scheduleStatus: 'COMPLETED',
      isAvailable: false,
      remainingSeconds: 0,
    };
  }

  // If assignment is explicitly marked SCHEDULED, or has assignedDate and now < openMs
  const isScheduled =
    assignment.status === AssignmentStatus.SCHEDULED ||
    (Boolean(assignment.assignedDate) && nowMs < openMs) ||
    (assignment.status !== AssignmentStatus.PUBLISHED && nowMs < openMs);

  if (isScheduled && nowMs < openMs) {
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
export class AssignmentsService {
  private readonly logger = new Logger(AssignmentsService.name);

  constructor(
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Exercise.name) private exerciseModel: Model<ExerciseDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(ExamTest.name) @Optional() private examTestModel?: Model<ExamTestDocument>,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private auditService?: AuditService,
  ) {}

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

    if (!dto.exerciseId || !Types.ObjectId.isValid(dto.exerciseId)) {
      errors.push('exerciseId is missing or invalid');
    } else {
      const exercise = await this.exerciseModel
        .findById(dto.exerciseId)
        .select('+questions.answerSpecification +questions.explanation')
        .exec();

      if (exercise) {
        if (exercise.status !== ExerciseStatus.PUBLISHED) {
          errors.push('Selected exercise is not published (must be PUBLISHED)');
        }
        questionsInScope = exercise.questions || [];
      } else if (this.examTestModel) {
        resolvedExamTest = await this.examTestModel.findById(dto.exerciseId).exec();
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
    const examTest = this.examTestModel ? await this.examTestModel.findById(dto.exerciseId).exec() : null;
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
    } else {
      const ex = await this.exerciseModel.findById(dto.exerciseId).select('+questions.answerSpecification +questions.explanation').exec();
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
      .populate('exerciseId', 'title type passScore')
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
    const snapshot: any = assignment.exerciseSnapshot || {};
    const questions = snapshot.questions || [];
    const totalPoints = questions.reduce((sum: number, q: any) => sum + (q.points || 1), 0);

    return {
      id: extractObjectId(assignment._id),
      course: { id: extractObjectId(course._id), code: course.code, title: course.title },
      title: assignment.title,
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

    if (!dto.courseId || !Types.ObjectId.isValid(dto.courseId)) {
      throw new BadRequestException('Invalid courseId');
    }
    if (!dto.exerciseId || !Types.ObjectId.isValid(dto.exerciseId)) {
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
            .populate('exerciseId', 'title type')
            .exec()
        : await q;
      if (existing) {
        return this.formatAssignment(existing);
      }
    }

    let exerciseTitle = '';
    let exerciseVersion = 1;
    let exerciseSnapshot: any = null;

    const exercise = await this.exerciseModel
      .findById(dto.exerciseId)
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
      examTest = await this.examTestModel.findById(dto.exerciseId).exec();
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
      const bounds = createVnDailyBounds(dto.targetDate);
      openAt = bounds.openAt;
      deadlineAt = bounds.deadlineAt;
      assignedDate = undefined as any;
    } else if (dto.openAt && dto.deadlineAt) {
      openAt = new Date(dto.openAt);
      deadlineAt = new Date(dto.deadlineAt);
      assignedDate = formatVnDateTime(openAt).slice(0, 10);
    } else if (dto.openAt && !dto.deadlineAt) {
      openAt = new Date(dto.openAt);
      const bounds = createVnDailyAssignmentBounds(openAt);
      deadlineAt = bounds.dueAt;
      assignedDate = bounds.assignedDate;
    } else if (!dto.openAt && dto.deadlineAt) {
      deadlineAt = new Date(dto.deadlineAt);
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
        exerciseId: new Types.ObjectId(dto.exerciseId),
        openAt,
        status: { $nin: [AssignmentStatus.ARCHIVED, AssignmentStatus.CLOSED] },
      });
      const duplicate = q?.populate
        ? await q
            .populate('courseId', 'code title')
            .populate('exerciseId', 'title type')
            .exec()
        : await q;

      if (duplicate) {
        return this.formatAssignment(duplicate);
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
      exerciseId: new Types.ObjectId(dto.exerciseId),
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
      allowRetake: dto.allowRetake ?? false,
      maxAttempts: dto.maxAttempts,
      requiredScope: dto.requiredScope || 'FULL',
      requiredPartId: dto.requiredPartId,
      allowedModes: dto.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: dto.durationSecondsOverride,
      status,
    });

    await assignment.save();

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

    // If published or scheduled, dispatch student assignments for all actively enrolled students
    if (status !== AssignmentStatus.DRAFT) {
      await this.dispatchStudentAssignments(assignment);
    }

    return this.formatAssignment(assignment, true);
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
        .populate('exerciseId', 'title type')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.assignmentModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatAssignment(d)),
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
          { path: 'exerciseId', select: 'title type passScore' },
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
    const items = paginated.map((sa: any) => {
      const assignment = sa.assignmentId;
      const studentLifecycle = computeStudentAssignmentLifecycleStatus(assignment, sa, now);
      return {
        id: extractObjectId(assignment._id),
        studentAssignmentId: extractObjectId(sa._id),
        assignmentId: extractObjectId(assignment._id),
        title: assignment.title,
        course: assignment.courseId
          ? {
              id: extractObjectId(assignment.courseId._id || assignment.courseId),
              code: assignment.courseId.code,
              title: assignment.courseId.title,
            }
          : undefined,
        exercise: assignment.exerciseId
          ? {
              id: extractObjectId(assignment.exerciseId._id || assignment.exerciseId),
              title: assignment.exerciseId.title,
              type: assignment.exerciseId.type,
              passScore: assignment.exerciseId.passScore,
            }
          : undefined,
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
        exerciseType: assignment.exerciseId?.type || 'reading',
        effectiveDueAt: sa.effectiveDeadlineAt || assignment.deadlineAt,
        passed: Boolean(sa.isTargetAchieved),
        attemptsCount: sa.attemptsCount || (sa.lastSubmittedAt ? 1 : 0),
        answerReviewUnlocked: Boolean(sa.isTargetAchieved),
        translationAvailable: Boolean(sa.isTargetAchieved && assignment.exerciseId?.type === 'reading'),
        translationStatus: sa.translationStatus || 'not_started',
        penaltyApplied: Boolean(sa.penaltyApplied),
        status: sa.status,
        scheduleStatus: studentLifecycle.scheduleStatus,
        isAvailable: studentLifecycle.isAvailable,
        remainingSeconds: studentLifecycle.remainingSeconds,
        bestScore: sa.bestScore,
        isTargetAchieved: sa.isTargetAchieved ?? false,
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
      .populate('exerciseId', 'title type passScore')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course: any = assignment.courseId;

    if (actor.role === UserRole.ADMIN) {
      return this.formatAssignment(assignment, true);
    }

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
      return this.formatAssignment(assignment, true);
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

    return this.formatAssignmentForStudent(assignment, studentAssignment);
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
      if (dto.deadlineAt) {
        newDeadlineAt = new Date(dto.deadlineAt);
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
    return this.formatAssignment(assignment, true);
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
        .populate('studentId', 'name email avatar status')
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .sort({ createdAt: -1 })
        .exec(),
      this.studentAssignmentModel.countDocuments({ assignmentId: assignment._id }).exec(),
    ]);

    const items = docs.map((doc: any) => ({
      id: extractObjectId(doc._id),
      student: doc.studentId
        ? {
            id: extractObjectId(doc.studentId._id || doc.studentId),
            name: doc.studentId.name,
            email: doc.studentId.email,
            avatar: doc.studentId.avatar,
            status: doc.studentId.status,
          }
        : undefined,
      originalDeadlineAt: doc.originalDeadlineAt,
      originalDeadlineAtVn: doc.originalDeadlineAt ? formatVnDateTime(doc.originalDeadlineAt) : undefined,
      effectiveDeadlineAt: doc.effectiveDeadlineAt,
      effectiveDeadlineAtVn: formatVnDateTime(doc.effectiveDeadlineAt),
      status: doc.status,
      bestScore: doc.bestScore,
      passedAt: doc.passedAt,
      lastSubmittedAt: doc.lastSubmittedAt,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
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

  private async dispatchStudentAssignments(assignment: AssignmentDocument): Promise<number> {
    const activeEnrollments = await this.enrollmentModel
      .find({
        courseId: assignment.courseId,
        status: EnrollmentStatus.ACTIVE,
      })
      .exec();

    if (activeEnrollments.length === 0) return 0;

    const toInsert = activeEnrollments.map((enr) => ({
      assignmentId: assignment._id,
      studentId: enr.studentId,
      originalDeadlineAt: assignment.deadlineAt,
      effectiveDeadlineAt: assignment.deadlineAt,
      status: StudentAssignmentStatus.NOT_STARTED,
    }));

    try {
      const result = await this.studentAssignmentModel.insertMany(toInsert, { ordered: false });

      // Notify enrolled students asynchronously
      if (this.notificationsService) {
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

      return result.length;
    } catch (err: any) {
      // Ignore duplicate key error (code 11000) for idempotency
      if (err.code === 11000 || (err.writeErrors && err.writeErrors.length > 0)) {
        return err.insertedDocs ? err.insertedDocs.length : 0;
      }
      throw err;
    }
  }

  private formatAssignment(assignment: any, includeSnapshot = false) {
    const raw = typeof assignment.toObject === 'function' ? assignment.toObject() : assignment;
    const courseId = raw.courseId
      ? typeof raw.courseId === 'object' && raw.courseId._id
        ? {
            id: extractObjectId(raw.courseId._id),
            code: raw.courseId.code,
            title: raw.courseId.title,
          }
        : extractObjectId(raw.courseId)
      : undefined;

    const exerciseId = raw.exerciseId
      ? typeof raw.exerciseId === 'object' && raw.exerciseId._id
        ? {
            id: extractObjectId(raw.exerciseId._id),
            title: raw.exerciseId.title,
            type: raw.exerciseId.type,
          }
        : extractObjectId(raw.exerciseId)
      : undefined;

    const now = new Date();
    const lifecycleStatus = computeAssignmentLifecycleStatus(raw, now);

    const res: any = {
      id: extractObjectId(raw._id || raw.id),
      courseId,
      exerciseId,
      exerciseVersion: raw.exerciseVersion,
      assignedBy: extractObjectId(raw.assignedBy),
      title: raw.title,
      requiredScope: raw.requiredScope || 'FULL',
      requiredPartId: raw.requiredPartId || null,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: raw.durationSecondsOverride || null,
      assignedDate: raw.assignedDate || formatVnDateTime(raw.openAt).slice(0, 10),
      selectedQuestionGroupIds: raw.selectedQuestionGroupIds || [],
      targetScorePercent: raw.targetScorePercent ?? 70,
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
      status: raw.status,
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

  private formatAssignmentForStudent(assignment: any, studentAssignment: any) {
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
      raw.status === AssignmentStatus.SCHEDULED ||
      (studentLifecycle.scheduleStatus === 'SCHEDULED' &&
        (Boolean(raw.assignedDate) || raw.status !== AssignmentStatus.PUBLISHED));

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

    return {
      id: extractObjectId(raw._id || raw.id),
      studentAssignmentId: extractObjectId(rawSa._id || rawSa.id),
      courseId: raw.courseId
        ? typeof raw.courseId === 'object' && raw.courseId._id
          ? {
              id: extractObjectId(raw.courseId._id),
              code: raw.courseId.code,
              title: raw.courseId.title,
            }
          : extractObjectId(raw.courseId)
        : undefined,
      exerciseId: raw.exerciseId
        ? typeof raw.exerciseId === 'object' && raw.exerciseId._id
          ? {
              id: extractObjectId(raw.exerciseId._id),
              title: raw.exerciseId.title,
              type: raw.exerciseId.type,
            }
          : extractObjectId(raw.exerciseId)
        : undefined,
      exerciseVersion: raw.exerciseVersion,
      title: raw.title,
      requiredScope: raw.requiredScope || 'FULL',
      requiredPartId: raw.requiredPartId || null,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: raw.durationSecondsOverride || null,
      assignedDate: raw.assignedDate || formatVnDateTime(raw.openAt).slice(0, 10),
      targetScorePercent: raw.targetScorePercent ?? 70,
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
      exercise: sanitizedExercise,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

