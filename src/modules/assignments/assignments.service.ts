import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Assignment, AssignmentDocument, ExerciseSnapshot } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Exercise, ExerciseDocument } from 'src/database/schemas/exercise.schema';
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
  NotificationType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { formatVnDateTime, createVnDailyBounds } from 'src/common/utils/timezone.util';
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
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private auditService?: AuditService,
  ) {}

  async create(dto: CreateAssignmentDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot create assignments');
    }

    if (!Types.ObjectId.isValid(dto.courseId)) {
      throw new BadRequestException('Invalid courseId');
    }
    if (!Types.ObjectId.isValid(dto.exerciseId)) {
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

    const exercise = await this.exerciseModel
      .findById(dto.exerciseId)
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    if (!exercise) {
      throw new NotFoundException('Exercise not found');
    }
    if (exercise.status !== ExerciseStatus.PUBLISHED) {
      throw new BadRequestException('Only published exercises can be assigned to courses');
    }

    // Determine openAt & deadlineAt
    let openAt: Date;
    let deadlineAt: Date;

    if (dto.targetDate) {
      const bounds = createVnDailyBounds(dto.targetDate);
      openAt = bounds.openAt;
      deadlineAt = bounds.deadlineAt;
    } else if (dto.openAt && dto.deadlineAt) {
      openAt = new Date(dto.openAt);
      deadlineAt = new Date(dto.deadlineAt);
    } else if (dto.openAt && !dto.deadlineAt) {
      openAt = new Date(dto.openAt);
      const bounds = createVnDailyBounds(openAt);
      deadlineAt = bounds.deadlineAt;
    } else if (!dto.openAt && dto.deadlineAt) {
      deadlineAt = new Date(dto.deadlineAt);
      const bounds = createVnDailyBounds(deadlineAt);
      openAt = bounds.openAt;
    } else {
      const bounds = createVnDailyBounds();
      openAt = bounds.openAt;
      deadlineAt = bounds.deadlineAt;
    }

    if (openAt.getTime() >= deadlineAt.getTime()) {
      throw new BadRequestException('openAt must be earlier than deadlineAt');
    }

    const exerciseSnapshot: ExerciseSnapshot = {
      title: exercise.title,
      type: exercise.type,
      passage: exercise.passage,
      audioAssets: exercise.audioAssets,
      questions: exercise.questions as any,
      passScore: exercise.passScore,
      version: exercise.version,
    };

    const status = dto.status || AssignmentStatus.PUBLISHED;

    const assignment = new this.assignmentModel({
      courseId: course._id,
      exerciseId: exercise._id,
      exerciseVersion: exercise.version,
      exerciseSnapshot,
      assignedBy: actor._id,
      title: dto.title || exercise.title,
      openAt,
      deadlineAt,
      allowRetake: dto.allowRetake ?? false,
      maxAttempts: dto.maxAttempts,
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

    // If published immediately, dispatch student assignments for all actively enrolled students
    if (status === AssignmentStatus.PUBLISHED) {
      await this.dispatchStudentAssignments(assignment);
    }

    return this.formatAssignment(assignment);
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

    // Filter by query parameters if specified
    let filtered = studentAssignments.filter((sa) => sa.assignmentId != null);

    if (query.courseId) {
      filtered = filtered.filter(
        (sa: any) =>
          extractObjectId(sa.assignmentId.courseId?._id || sa.assignmentId.courseId) ===
          query.courseId,
      );
    }

    if (query.status) {
      filtered = filtered.filter((sa: any) => sa.assignmentId.status === query.status);
    }

    const total = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    const items = paginated.map((sa: any) => {
      const assignment = sa.assignmentId;
      return {
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
        openAt: assignment.openAt,
        openAtVn: formatVnDateTime(assignment.openAt),
        deadlineAt: assignment.deadlineAt,
        deadlineAtVn: formatVnDateTime(assignment.deadlineAt),
        effectiveDeadlineAt: sa.effectiveDeadlineAt,
        effectiveDeadlineAtVn: formatVnDateTime(sa.effectiveDeadlineAt),
        status: sa.status,
        bestScore: sa.bestScore,
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

    let datesModified = false;
    let newOpenAt = assignment.openAt;
    let newDeadlineAt = assignment.deadlineAt;
    const oldDeadline = assignment.deadlineAt;

    if (dto.openAt) {
      newOpenAt = new Date(dto.openAt);
      datesModified = true;
    }
    if (dto.deadlineAt) {
      newDeadlineAt = new Date(dto.deadlineAt);
      datesModified = true;
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
    if (dto.status && dto.status !== prevStatus) {
      assignment.status = dto.status;
      if (
        prevStatus === AssignmentStatus.DRAFT &&
        dto.status === AssignmentStatus.PUBLISHED
      ) {
        await this.dispatchStudentAssignments(assignment);
      }
    }

    await assignment.save();
    return this.formatAssignment(assignment);
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

    const res: any = {
      id: extractObjectId(raw._id || raw.id),
      courseId,
      exerciseId,
      exerciseVersion: raw.exerciseVersion,
      assignedBy: extractObjectId(raw.assignedBy),
      title: raw.title,
      openAt: raw.openAt,
      openAtVn: formatVnDateTime(raw.openAt),
      deadlineAt: raw.deadlineAt,
      deadlineAtVn: formatVnDateTime(raw.deadlineAt),
      allowRetake: raw.allowRetake,
      maxAttempts: raw.maxAttempts,
      status: raw.status,
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

    let sanitizedExercise: any = undefined;
    if (raw.exerciseSnapshot) {
      sanitizedExercise = ExerciseMapper.toSanitized(raw.exerciseSnapshot);
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
      openAt: raw.openAt,
      openAtVn: formatVnDateTime(raw.openAt),
      deadlineAt: raw.deadlineAt,
      deadlineAtVn: formatVnDateTime(raw.deadlineAt),
      effectiveDeadlineAt: rawSa.effectiveDeadlineAt,
      effectiveDeadlineAtVn: formatVnDateTime(rawSa.effectiveDeadlineAt),
      allowRetake: raw.allowRetake,
      maxAttempts: raw.maxAttempts,
      assignmentStatus: raw.status,
      myStatus: rawSa.status,
      bestScore: rawSa.bestScore,
      passedAt: rawSa.passedAt,
      lastSubmittedAt: rawSa.lastSubmittedAt,
      exercise: sanitizedExercise,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

