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
  PenaltyTransaction,
  PenaltyTransactionDocument,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  StudentProfile,
  StudentProfileDocument,
} from 'src/database/schemas/student-profile.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { EnrollmentStatus, UserRole } from 'src/database/schemas/enums';
import { ReversePenaltyDto } from './dto/reverse-penalty.dto';
import { PenaltyQueryDto } from './dto/penalty-query.dto';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
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
export class PenaltiesService {
  private readonly logger = new Logger(PenaltiesService.name);

  constructor(
    @InjectModel(PenaltyTransaction.name)
    private penaltyModel: Model<PenaltyTransactionDocument>,
    @InjectModel(StudentProfile.name)
    private studentProfileModel: Model<StudentProfileDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectConnection() private connection: Connection,
    @Optional() private auditService?: AuditService,
  ) {}

  async getMine(student: UserDocument, query: PenaltyQueryDto) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can view their personal penalty ledger');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [docs, total, aggResult] = await Promise.all([
      this.penaltyModel
        .find({ studentId: student._id })
        .populate({
          path: 'studentAssignmentId',
          select: 'effectiveDeadlineAt',
          populate: { path: 'assignmentId', select: 'title' },
        })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.penaltyModel.countDocuments({ studentId: student._id }).exec(),
      this.penaltyModel.aggregate([
        { $match: { studentId: student._id } },
        { $group: { _id: null, totalPoints: { $sum: '$deltaPoints' } } },
      ]),
    ]);

    const totalPoints = aggResult.length > 0 ? Math.max(0, aggResult[0].totalPoints) : 0;

    return {
      totalPoints,
      items: docs.map((d) => this.formatTransaction(d)),
      total,
      page,
      limit,
    };
  }

  async findAll(actor: UserDocument, query: PenaltyQueryDto) {
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
        const enrollments = await this.enrollmentModel
          .find({ courseId: new Types.ObjectId(query.courseId), status: EnrollmentStatus.ACTIVE })
          .select('studentId')
          .exec();
        const studentIds = enrollments.map((e) => e.studentId);
        filter.studentId = { $in: studentIds };
      } else {
        const enrollments = await this.enrollmentModel
          .find({ courseId: { $in: teacherCourseIds }, status: EnrollmentStatus.ACTIVE })
          .select('studentId')
          .exec();
        const studentIds = enrollments.map((e) => e.studentId);
        filter.studentId = { $in: studentIds };
      }
    } else if (actor.role === UserRole.ADMIN) {
      if (query.studentId) {
        if (!Types.ObjectId.isValid(query.studentId)) {
          throw new BadRequestException('Invalid studentId');
        }
        filter.studentId = new Types.ObjectId(query.studentId);
      }
    } else {
      throw new ForbiddenException('Students must view their penalty ledger via /penalties/mine');
    }

    if (query.studentId && actor.role === UserRole.TEACHER) {
      filter.studentId = new Types.ObjectId(query.studentId);
    }

    const [docs, total] = await Promise.all([
      this.penaltyModel
        .find(filter)
        .populate('studentId', 'name fullName email avatar')
        .populate({
          path: 'studentAssignmentId',
          select: 'effectiveDeadlineAt',
          populate: { path: 'assignmentId', select: 'title' },
        })
        .populate('actorId', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.penaltyModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatTransaction(d)),
      total,
      page,
      limit,
    };
  }

  async reverse(transactionId: string, dto: ReversePenaltyDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot reverse penalties');
    }

    if (!Types.ObjectId.isValid(transactionId)) {
      throw new NotFoundException('Penalty transaction not found');
    }

    const original = await this.penaltyModel.findById(transactionId).exec();
    if (!original) {
      throw new NotFoundException('Penalty transaction not found');
    }

    if (original.deltaPoints <= 0) {
      throw new BadRequestException('Cannot reverse a transaction that is not a penalty charge (+1)');
    }

    // Check if already reversed
    const existingReversal = await this.penaltyModel
      .findOne({ reversedTransactionId: original._id })
      .exec();

    if (existingReversal) {
      throw new BadRequestException('This penalty transaction has already been reversed');
    }

    // Teacher check
    if (actor.role === UserRole.TEACHER) {
      const studentAssignment = await this.studentAssignmentModel
        .findById(original.studentAssignmentId)
        .populate('assignmentId', 'courseId')
        .exec();

      if (studentAssignment && studentAssignment.assignmentId) {
        const assignment: any = studentAssignment.assignmentId;
        const course = await this.courseModel.findById(assignment.courseId).exec();
        const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
        if (!isTeacher) {
          throw new ForbiddenException('You do not teach this course');
        }
      }
    }

    const idempotencyKey = `reverse:${original._id}:${Date.now()}`;
    let reversalDoc: PenaltyTransactionDocument;

    const session = await this.connection.startSession();
    try {
      await session.withTransaction(async () => {
        reversalDoc = new this.penaltyModel({
          studentId: original.studentId,
          studentAssignmentId: original.studentAssignmentId,
          deltaPoints: -1,
          reason: `[REVERSAL] ${dto.reason}`,
          idempotencyKey,
          actorId: actor._id,
          reversedTransactionId: original._id,
        });

        await reversalDoc.save({ session });

        original.isReversed = true;
        await original.save({ session });

        // Update cached penalty points in profile
        const profile = await this.studentProfileModel
          .findOne({ userId: original.studentId })
          .session(session)
          .exec();

        if (profile) {
          profile.penaltyPointsCache = Math.max(0, (profile.penaltyPointsCache || 1) - 1);
          await profile.save({ session });
        }
      });
    } finally {
      await session.endSession();
    }

    if (this.auditService) {
      this.auditService
        .log({
          action: 'PENALTY_REVERSED',
          entityType: 'PenaltyTransaction',
          entityId: original._id,
          actorId: actor._id,
          metadata: {
            reason: dto.reason,
            originalPenaltyId: original._id.toString(),
            studentId: original.studentId.toString(),
          },
        })
        .catch((err) => this.logger.warn(`Failed to audit penalty reversal: ${err.message}`));
    }

    return this.formatTransaction(reversalDoc!);
  }

  private formatTransaction(doc: PenaltyTransactionDocument) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

    return {
      id: extractObjectId(raw._id),
      studentId: extractObjectId(raw.studentId),
      student: raw.studentId && typeof raw.studentId === 'object' ? raw.studentId : undefined,
      studentAssignmentId: extractObjectId(raw.studentAssignmentId),
      studentAssignment:
        raw.studentAssignmentId && typeof raw.studentAssignmentId === 'object'
          ? raw.studentAssignmentId
          : undefined,
      deltaPoints: raw.deltaPoints,
      reason: raw.reason,
      idempotencyKey: raw.idempotencyKey,
      actorId: raw.actorId ? extractObjectId(raw.actorId) : undefined,
      actor: raw.actorId && typeof raw.actorId === 'object' ? raw.actorId : undefined,
      reversedTransactionId: raw.reversedTransactionId
        ? extractObjectId(raw.reversedTransactionId)
        : undefined,
      createdAt: raw.createdAt,
      createdAtVn: raw.createdAt ? formatVnDateTime(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt,
    };
  }
}

