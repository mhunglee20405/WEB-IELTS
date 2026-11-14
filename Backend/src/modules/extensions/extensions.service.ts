import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import {
  ExtensionRequest,
  ExtensionRequestDocument,
} from 'src/database/schemas/extension-request.schema';
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
import {
  ExtensionRequestStatus,
  NotificationType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { CreateExtensionRequestDto } from './dto/create-extension-request.dto';
import { ReviewExtensionRequestDto } from './dto/review-extension-request.dto';
import { ExtensionQueryDto } from './dto/extension-query.dto';
import {
  formatVnDateTime,
  createVnMonthBounds,
} from 'src/common/utils/timezone.util';
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
export class ExtensionsService {
  private readonly logger = new Logger(ExtensionsService.name);

  constructor(
    @InjectModel(ExtensionRequest.name)
    private extensionModel: Model<ExtensionRequestDocument>,
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
    @Optional() private auditService?: AuditService,
  ) {}

  async create(dto: CreateExtensionRequestDto, student: UserDocument) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can submit extension requests');
    }

    if (!Types.ObjectId.isValid(dto.studentAssignmentId)) {
      throw new BadRequestException('Invalid studentAssignmentId');
    }

    const studentAssignment = await this.studentAssignmentModel
      .findById(dto.studentAssignmentId)
      .exec();

    if (!studentAssignment) {
      throw new NotFoundException('Student assignment not found');
    }

    if (extractObjectId(studentAssignment.studentId) !== extractObjectId(student._id)) {
      throw new ForbiddenException('You can only request extensions for your own assignments');
    }

    if (studentAssignment.status === StudentAssignmentStatus.PASSED) {
      throw new BadRequestException('Cannot request extension for an already passed assignment');
    }

    const requestedDate = new Date(dto.requestedDeadlineAt);
    if (isNaN(requestedDate.getTime())) {
      throw new BadRequestException('Invalid requestedDeadlineAt date string');
    }

    const currentEffective = new Date(studentAssignment.effectiveDeadlineAt);
    if (requestedDate.getTime() <= currentEffective.getTime()) {
      throw new BadRequestException('Requested deadline must be later than current effective deadline');
    }

    if (requestedDate.getTime() <= Date.now()) {
      throw new BadRequestException('Requested deadline must be in the future');
    }

    const assignment = await this.assignmentModel.findById(studentAssignment.assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Associated assignment not found');
    }

    // Atomic quota enforcement in Asia/Ho_Chi_Minh month bounds
    const { startOfMonth, endOfMonth } = createVnMonthBounds(new Date());

    let createdRequest: ExtensionRequestDocument;
    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        // Document-level write lock on student profile to serialize concurrent quota checks for same student
        await this.studentProfileModel.updateOne(
          { userId: student._id },
          { $set: { 'metadata.lastExtensionQuotaCheckAt': new Date() } },
          { session },
        );

        // 1. Check for existing pending request for this studentAssignment first (Conflict)
        const existingPending = await this.extensionModel
          .findOne({
            studentAssignmentId: studentAssignment._id,
            status: ExtensionRequestStatus.PENDING,
          })
          .session(session)
          .exec();

        if (existingPending) {
          throw new ConflictException(
            'A pending extension request already exists for this assignment',
          );
        }

        // 2. Check quota inside transaction (BadRequest)
        const usedCount = await this.extensionModel
          .countDocuments({
            studentId: student._id,
            createdAt: { $gte: startOfMonth, $lte: endOfMonth },
          })
          .session(session)
          .exec();

        if (usedCount >= 3) {
          throw new BadRequestException(
            'Monthly extension request quota reached (maximum 3 requests per calendar month)',
          );
        }

        const requestDoc = new this.extensionModel({
          studentAssignmentId: studentAssignment._id,
          studentId: student._id,
          courseId: assignment.courseId,
          reason: dto.reason,
          requestedDeadlineAt: requestedDate,
          status: ExtensionRequestStatus.PENDING,
        });

        createdRequest = await requestDoc.save({ session });
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          'A pending extension request already exists for this assignment',
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }

    return this.formatRequest(createdRequest!, studentAssignment);
  }

  async getQuota(student: UserDocument) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students have extension request quotas');
    }

    const { startOfMonth, endOfMonth } = createVnMonthBounds(new Date());

    const count = await this.extensionModel
      .countDocuments({
        studentId: student._id,
        createdAt: { $gte: startOfMonth, $lte: endOfMonth },
      })
      .exec();

    return {
      month: formatVnDateTime(new Date()).slice(0, 7),
      used: count,
      limit: 3,
      remaining: Math.max(0, 3 - count),
      resetAtVn: formatVnDateTime(endOfMonth),
    };
  }

  async findMine(student: UserDocument, query: ExtensionQueryDto) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can view their personal extension requests');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = { studentId: student._id };
    if (query.status) {
      filter.status = query.status;
    }

    const [docs, total] = await Promise.all([
      this.extensionModel
        .find(filter)
        .populate('courseId', 'code title')
        .populate({
          path: 'studentAssignmentId',
          select: 'effectiveDeadlineAt originalDeadlineAt status',
          populate: { path: 'assignmentId', select: 'title' },
        })
        .populate('reviewedBy', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.extensionModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatRequest(d)),
      total,
      page,
      limit,
    };
  }

  async cancel(id: string, student: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Extension request not found');
    }

    const requestDoc = await this.extensionModel.findById(id).exec();
    if (!requestDoc) {
      throw new NotFoundException('Extension request not found');
    }

    if (extractObjectId(requestDoc.studentId) !== extractObjectId(student._id)) {
      throw new ForbiddenException('You can only cancel your own extension requests');
    }

    if (requestDoc.status !== ExtensionRequestStatus.PENDING) {
      throw new BadRequestException('Only pending extension requests can be cancelled');
    }

    requestDoc.status = ExtensionRequestStatus.CANCELLED;
    await requestDoc.save();

    return this.formatRequest(requestDoc);
  }

  async findAll(actor: UserDocument, query: ExtensionQueryDto) {
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
        if (!teacherCourseIds.some((id) => id.toHexString() === query.courseId)) {
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
      throw new ForbiddenException('Students must view their extension requests via /extension-requests/mine');
    }

    if (query.status) {
      filter.status = query.status;
    }
    if (query.studentId && Types.ObjectId.isValid(query.studentId)) {
      filter.studentId = new Types.ObjectId(query.studentId);
    }

    const [docs, total] = await Promise.all([
      this.extensionModel
        .find(filter)
        .populate('studentId', 'name fullName email avatar')
        .populate('courseId', 'code title')
        .populate({
          path: 'studentAssignmentId',
          select: 'effectiveDeadlineAt originalDeadlineAt status',
          populate: { path: 'assignmentId', select: 'title' },
        })
        .populate('reviewedBy', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.extensionModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatRequest(d)),
      total,
      page,
      limit,
    };
  }

  async findById(id: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Extension request not found');
    }

    const requestDoc = await this.extensionModel
      .findById(id)
      .populate('studentId', 'name fullName email avatar')
      .populate('courseId', 'code title teacherId')
      .populate({
        path: 'studentAssignmentId',
        select: 'effectiveDeadlineAt originalDeadlineAt status',
        populate: { path: 'assignmentId', select: 'title' },
      })
      .populate('reviewedBy', 'fullName email')
      .exec();

    if (!requestDoc) {
      throw new NotFoundException('Extension request not found');
    }

    if (actor.role === UserRole.STUDENT) {
      if (extractObjectId(requestDoc.studentId) !== extractObjectId(actor._id)) {
        throw new ForbiddenException('You can only view your own extension requests');
      }
    } else if (actor.role === UserRole.TEACHER) {
      const course: any = requestDoc.courseId;
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    return this.formatRequest(requestDoc);
  }

  async review(id: string, dto: ReviewExtensionRequestDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot review extension requests');
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Extension request not found');
    }

    const requestDoc = await this.extensionModel.findById(id).exec();
    if (!requestDoc) {
      throw new NotFoundException('Extension request not found');
    }

    const course = await this.courseModel.findById(requestDoc.courseId).exec();
    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    if (requestDoc.status !== ExtensionRequestStatus.PENDING) {
      throw new BadRequestException('Only pending extension requests can be reviewed');
    }

    const studentAssignment = await this.studentAssignmentModel
      .findById(requestDoc.studentAssignmentId)
      .exec();

    if (!studentAssignment) {
      throw new NotFoundException('Student assignment not found');
    }

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        if (dto.status === ExtensionRequestStatus.APPROVED) {
          const approvedDeadline = dto.approvedDeadlineAt
            ? new Date(dto.approvedDeadlineAt)
            : requestDoc.requestedDeadlineAt;

          studentAssignment.effectiveDeadlineAt = approvedDeadline;

          // If assignment was previously marked OVERDUE, revert to appropriate in-progress status
          if (studentAssignment.status === StudentAssignmentStatus.OVERDUE) {
            studentAssignment.status = studentAssignment.lastSubmittedAt
              ? StudentAssignmentStatus.SUBMITTED
              : StudentAssignmentStatus.NOT_STARTED;
          }

          // Reverse any active overdue penalties for this studentAssignment
          const activePenalties = await this.penaltyModel
            .find({
              studentAssignmentId: studentAssignment._id,
              deltaPoints: { $gt: 0 },
              isReversed: { $ne: true },
            })
            .session(session)
            .exec();

          for (const activePenalty of activePenalties) {
            const reversal = new this.penaltyModel({
              studentId: studentAssignment.studentId,
              studentAssignmentId: studentAssignment._id,
              deltaPoints: -activePenalty.deltaPoints,
              reason: `Automatic penalty reversal upon approved extension request #${extractObjectId(requestDoc._id)}`,
              reversedTransactionId: activePenalty._id,
              createdBy: actor._id,
              idempotencyKey: `penalty:reversal:extension:${requestDoc._id}:${activePenalty._id}`,
            });
            await reversal.save({ session });

            activePenalty.isReversed = true;
            await activePenalty.save({ session });

            await this.studentProfileModel.updateOne(
              { userId: studentAssignment.studentId },
              { $inc: { penaltyPointsCache: -activePenalty.deltaPoints } },
              { session },
            );
          }

          await studentAssignment.save({ session });
        }

        requestDoc.status = dto.status;
        requestDoc.reviewedBy = actor._id as Types.ObjectId;
        requestDoc.reviewedAt = new Date();
        if (dto.reviewNote) {
          requestDoc.reviewNote = dto.reviewNote;
        }

        await requestDoc.save({ session });
      });
    } finally {
      await session.endSession();
    }

    // Post-transaction notifications and audit logging
    if (this.notificationsService) {
      const isApproved = dto.status === ExtensionRequestStatus.APPROVED;
      const notifType = NotificationType.EXTENSION_REVIEWED;
      const notifTitle = isApproved
        ? 'Yêu cầu xin gia hạn bài tập đã được duyệt'
        : 'Yêu cầu xin gia hạn bài tập đã bị từ chối';
      const notifBody = dto.reviewNote
        ? `Giáo viên đã nhận xét: "${dto.reviewNote}"`
        : isApproved
          ? 'Hạn nộp mới của bạn đã được cập nhật thành công.'
          : 'Yêu cầu gia hạn của bạn không được phê duyệt. Vui lòng nộp bài sớm.';

      this.notificationsService
        .create({
          userId: extractObjectId(requestDoc.studentId),
          type: notifType,
          title: notifTitle,
          body: notifBody,
          payload: {
            requestId: extractObjectId(requestDoc._id),
            studentAssignmentId: extractObjectId(requestDoc.studentAssignmentId),
            status: dto.status,
            reviewNote: dto.reviewNote,
          },
          sendEmail: true,
          emailTemplateKey: 'extension-reviewed',
        })
        .catch((err) => this.logger.warn(`Failed to dispatch extension review notification: ${err.message}`));
    }

    if (this.auditService) {
      this.auditService
        .log({
          action: 'EXTENSION_REQUEST_REVIEWED',
          entityType: 'ExtensionRequest',
          entityId: requestDoc._id,
          actorId: actor._id,
          metadata: {
            status: dto.status,
            reviewNote: dto.reviewNote,
            studentAssignmentId: requestDoc.studentAssignmentId,
          },
        })
        .catch((err) => this.logger.warn(`Failed to audit extension review: ${err.message}`));
    }

    return this.formatRequest(requestDoc, studentAssignment);
  }

  private formatRequest(doc: ExtensionRequestDocument, sa?: any) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const studentAssignment = sa || raw.studentAssignmentId;
    const assignmentTitle =
      studentAssignment?.assignmentId?.title ||
      studentAssignment?.title ||
      raw.assignmentTitle ||
      'Assignment';

    return {
      id: extractObjectId(raw._id),
      studentId: extractObjectId(raw.studentId),
      student: raw.studentId && typeof raw.studentId === 'object' ? raw.studentId : undefined,
      studentName: raw.student?.fullName || raw.studentId?.fullName || undefined,
      courseId: extractObjectId(raw.courseId),
      course: raw.courseId && typeof raw.courseId === 'object' ? raw.courseId : undefined,
      courseTitle: raw.course?.title || raw.courseId?.title || undefined,
      studentAssignmentId: extractObjectId(raw.studentAssignmentId),
      assignmentTitle,
      studentAssignment:
        studentAssignment && typeof studentAssignment === 'object' ? studentAssignment : undefined,
      reason: raw.reason,
      requestedDeadlineAt: raw.requestedDeadlineAt,
      requestedDeadlineAtVn: formatVnDateTime(raw.requestedDeadlineAt),
      requestedDueAt: raw.requestedDeadlineAt ? new Date(raw.requestedDeadlineAt).toISOString() : undefined,
      originalDueAt: studentAssignment?.originalDeadlineAt ? new Date(studentAssignment.originalDeadlineAt).toISOString() : undefined,
      grantedDueAt: raw.grantedDeadlineAt ? new Date(raw.grantedDeadlineAt).toISOString() : undefined,
      status: raw.status,
      reviewedBy: raw.reviewedBy ? extractObjectId(raw.reviewedBy) : undefined,
      reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt).toISOString() : undefined,
      reviewedAtVn: raw.reviewedAt ? formatVnDateTime(raw.reviewedAt) : undefined,
      reviewNote: raw.reviewNote,
      createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : undefined,
      createdAtVn: raw.createdAt ? formatVnDateTime(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt,
    };
  }
}
