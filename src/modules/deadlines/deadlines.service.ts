import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import {
  PenaltyTransaction,
  PenaltyTransactionDocument,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from 'src/database/schemas/student-profile.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { NotificationType, StudentAssignmentStatus, UserRole } from 'src/database/schemas/enums';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { ProcessOverdueDto } from './dto/process-overdue.dto';
import { NotificationsService } from 'src/modules/notifications/notifications.service';

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
 * Centralized deadline evaluation logic:
 * - Completed/PASSED assignments are never overdue.
 * - Excused assignments are never overdue.
 * - Returns true only if referenceDate is strictly greater than effectiveDeadlineAt.
 */
export function isAssignmentOverdue(
  studentAssignment: { effectiveDeadlineAt: Date; status: StudentAssignmentStatus },
  referenceDate: Date = new Date(),
): boolean {
  if (
    studentAssignment.status === StudentAssignmentStatus.PASSED ||
    studentAssignment.status === StudentAssignmentStatus.EXCUSED
  ) {
    return false;
  }
  const deadlineMs = new Date(studentAssignment.effectiveDeadlineAt).getTime();
  const refMs = new Date(referenceDate).getTime();
  return refMs > deadlineMs;
}

@Injectable()
export class DeadlinesService {
  private readonly logger = new Logger(DeadlinesService.name);

  constructor(
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(PenaltyTransaction.name)
    private penaltyModel: Model<PenaltyTransactionDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectConnection() private connection: Connection,
    @Optional() private notificationsService?: NotificationsService,
  ) {}

  /**
   * Idempotent batch overdue processor:
   * - Scans due assignments where effectiveDeadlineAt < referenceDate
   * - Marks status as OVERDUE
   * - Generates deterministic +1 penalty with idempotencyKey
   * - Re-running on same assignments will not double charge
   */
  async processOverdueAssignments(
    dto: ProcessOverdueDto = {},
    actor?: UserDocument,
    referenceDate: Date = new Date(),
  ) {
    const limit = Math.min(500, Math.max(1, dto.limit || 100));
    const filter: Record<string, any> = {
      status: {
        $in: [
          StudentAssignmentStatus.NOT_STARTED,
          StudentAssignmentStatus.IN_PROGRESS,
          StudentAssignmentStatus.SUBMITTED,
        ],
      },
      effectiveDeadlineAt: { $lt: referenceDate },
    };

    if (actor && actor.role === UserRole.TEACHER) {
      const teacherCourses = await this.courseModel
        .find({ teacherId: actor._id })
        .select('_id')
        .exec();
      const courseIds = teacherCourses.map((c) => c._id);

      if (dto.courseId) {
        if (!courseIds.some((id) => id.toHexString() === dto.courseId)) {
          throw new ForbiddenException('You do not teach this course');
        }
        const assignments = await this.assignmentModel
          .find({ courseId: new Types.ObjectId(dto.courseId) })
          .select('_id')
          .exec();
        filter.assignmentId = { $in: assignments.map((a) => a._id) };
      } else {
        const assignments = await this.assignmentModel
          .find({ courseId: { $in: courseIds } })
          .select('_id')
          .exec();
        filter.assignmentId = { $in: assignments.map((a) => a._id) };
      }
    } else if (dto.courseId) {
      if (!Types.ObjectId.isValid(dto.courseId)) {
        throw new BadRequestException('Invalid courseId');
      }
      const assignments = await this.assignmentModel
        .find({ courseId: new Types.ObjectId(dto.courseId) })
        .select('_id')
        .exec();
      filter.assignmentId = { $in: assignments.map((a) => a._id) };
    }

    const overdueList = await this.studentAssignmentModel
      .find(filter)
      .sort({ effectiveDeadlineAt: 1 })
      .limit(limit)
      .exec();

    let processedCount = 0;
    let newPenaltiesCount = 0;

    for (const sa of overdueList) {
      const idempotencyKey = `penalty:overdue:${sa._id}`;

      const session = await this.connection.startSession();
      try {
        await session.withTransaction(async () => {
          sa.status = StudentAssignmentStatus.OVERDUE;
          await sa.save({ session });

          // Audit requirement: prevent second penalty for same student assignment even if effectiveDeadline changed
          const existingPenalty = await this.penaltyModel
            .findOne({
              $or: [
                { idempotencyKey },
                { studentAssignmentId: sa._id, deltaPoints: { $gt: 0 } },
              ],
            })
            .session(session)
            .exec();

          if (!existingPenalty) {
            const penalty = new this.penaltyModel({
              studentId: sa.studentId,
              studentAssignmentId: sa._id,
              deltaPoints: 1,
              reason: `Assignment overdue beyond effective deadline ${new Date(sa.effectiveDeadlineAt).toISOString()}`,
              idempotencyKey,
            });
            await penalty.save({ session });

            await this.studentProfileModel.updateOne(
              { userId: sa.studentId },
              { $inc: { penaltyPointsCache: 1 } },
              { session },
            );
            newPenaltiesCount++;

            // Dispatch notification to student asynchronously
            if (this.notificationsService) {
              this.notificationsService
                .create({
                  userId: sa.studentId.toString(),
                  type: NotificationType.OVERDUE,
                  title: 'Cảnh báo: Bài tập đã quá hạn',
                  body: `Bài tập của bạn đã quá hạn nộp. Hệ thống đã ghi nhận 1 điểm phạt.`,
                  payload: {
                    studentAssignmentId: sa._id.toString(),
                    effectiveDeadlineAt: sa.effectiveDeadlineAt.toISOString(),
                  },
                  sendEmail: true,
                  emailTemplateKey: 'assignment-overdue',
                })
                .catch((err) => this.logger.warn(`Failed to notify overdue assignment: ${err.message}`));
            }
          }
        });
        processedCount++;
      } catch (err: any) {
        if (err.code === 11000) {
          // Idempotency collision: already charged in concurrent run
          processedCount++;
        } else {
          throw err;
        }
      } finally {
        await session.endSession();
      }
    }

    return {
      message: 'Overdue deadline processing completed',
      evaluatedCount: overdueList.length,
      processedCount,
      newPenaltiesCount,
      referenceDateVn: formatVnDateTime(referenceDate),
    };
  }

  async getOverdueAssignments(
    courseId?: string,
    actor?: UserDocument,
    page = 1,
    limit = 20,
  ) {
    const pageNum = Math.max(1, page);
    const limitNum = Math.min(100, Math.max(1, limit));

    const filter: Record<string, any> = {
      status: StudentAssignmentStatus.OVERDUE,
    };

    if (actor && actor.role === UserRole.TEACHER) {
      const teacherCourses = await this.courseModel
        .find({ teacherId: actor._id })
        .select('_id')
        .exec();
      const teacherCourseIds = teacherCourses.map((c) => c._id);

      if (courseId) {
        if (!teacherCourseIds.some((id) => id.toHexString() === courseId)) {
          throw new ForbiddenException('You do not teach this course');
        }
        const assignments = await this.assignmentModel
          .find({ courseId: new Types.ObjectId(courseId) })
          .select('_id')
          .exec();
        filter.assignmentId = { $in: assignments.map((a) => a._id) };
      } else {
        const assignments = await this.assignmentModel
          .find({ courseId: { $in: teacherCourseIds } })
          .select('_id')
          .exec();
        filter.assignmentId = { $in: assignments.map((a) => a._id) };
      }
    } else if (courseId) {
      if (!Types.ObjectId.isValid(courseId)) {
        throw new BadRequestException('Invalid courseId');
      }
      const assignments = await this.assignmentModel
        .find({ courseId: new Types.ObjectId(courseId) })
        .select('_id')
        .exec();
      filter.assignmentId = { $in: assignments.map((a) => a._id) };
    }

    const [docs, total] = await Promise.all([
      this.studentAssignmentModel
        .find(filter)
        .populate('studentId', 'name fullName email avatar')
        .populate({
          path: 'assignmentId',
          select: 'title courseId deadlineAt',
          populate: { path: 'courseId', select: 'code title' },
        })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .sort({ effectiveDeadlineAt: -1 })
        .exec(),
      this.studentAssignmentModel.countDocuments(filter).exec(),
    ]);

    const items = docs.map((doc: any) => ({
      id: extractObjectId(doc._id),
      student: doc.studentId,
      assignment: doc.assignmentId,
      originalDeadlineAt: doc.originalDeadlineAt,
      originalDeadlineAtVn: doc.originalDeadlineAt
        ? formatVnDateTime(doc.originalDeadlineAt)
        : undefined,
      effectiveDeadlineAt: doc.effectiveDeadlineAt,
      effectiveDeadlineAtVn: formatVnDateTime(doc.effectiveDeadlineAt),
      status: doc.status,
      bestScore: doc.bestScore,
      lastSubmittedAt: doc.lastSubmittedAt,
    }));

    return {
      items,
      total,
      page: pageNum,
      limit: limitNum,
    };
  }
}

