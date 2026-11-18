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
import { User, UserDocument } from 'src/database/schemas/user.schema';
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
    @Optional() @InjectModel(User.name) private userModel?: Model<UserDocument>,
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
        .populate([
          {
            path: 'studentAssignmentId',
            select: 'effectiveDeadlineAt assignmentId',
            populate: {
              path: 'assignmentId',
              select: 'title courseId',
              populate: { path: 'courseId', select: 'title code' },
            },
          },
          { path: 'reversedBy', select: 'fullName email' },
        ])
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
    const formattedDocs = docs.map((d) => this.formatTransaction(d));

    return {
      totalPoints,
      totalActivePoints: totalPoints,
      items: formattedDocs,
      records: formattedDocs,
      total,
      page,
      limit,
    };
  }

  async findAll(actor: UserDocument, query: PenaltyQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = {};

    // Only audit primary penalty charges (+1); reversals are compensating audit records
    filter.deltaPoints = { $gt: 0 };

    if (query.status === 'active') {
      filter.isReversed = { $ne: true };
    } else if (query.status === 'reversed') {
      filter.isReversed = true;
    }

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
      if (!Types.ObjectId.isValid(query.studentId)) {
        throw new BadRequestException('Invalid studentId');
      }
      filter.studentId = new Types.ObjectId(query.studentId);
    }

    if (query.search && query.search.trim()) {
      const term = query.search.trim();
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(escaped, 'i');
      let matchedStudentIds: Types.ObjectId[] = [];
      if (this.userModel) {
        const matchedUsers = await this.userModel
          .find({ $or: [{ fullName: regex }, { email: regex }] })
          .select('_id')
          .exec();
        matchedStudentIds = matchedUsers.map((u) => u._id as Types.ObjectId);
      }

      if (matchedStudentIds.length > 0) {
        if (filter.studentId) {
          filter.$and = [
            { $or: [{ reason: regex }, { studentId: { $in: matchedStudentIds } }] },
          ];
        } else {
          filter.$or = [{ reason: regex }, { studentId: { $in: matchedStudentIds } }];
        }
      } else {
        filter.reason = regex;
      }
    }

    const [docs, total] = await Promise.all([
      this.penaltyModel
        .find(filter)
        .populate([
          { path: 'studentId', select: 'name fullName email avatar' },
          {
            path: 'studentAssignmentId',
            select: 'effectiveDeadlineAt assignmentId',
            populate: {
              path: 'assignmentId',
              select: 'title courseId',
              populate: { path: 'courseId', select: 'title code' },
            },
          },
          { path: 'actorId', select: 'fullName email' },
          { path: 'reversedBy', select: 'fullName email' },
        ])
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.penaltyModel.countDocuments(filter).exec(),
    ]);

    const items = docs.map((d) => this.formatTransaction(d));

    return {
      items,
      records: items,
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

    const idempotencyKey = `reverse:${original._id}`;
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
        original.reversedBy = actor._id;
        original.reversedAt = new Date();
        original.reversalReason = dto.reason;
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

  formatTransaction(doc: PenaltyTransactionDocument) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;

    const studentObj: any =
      raw.studentId && typeof raw.studentId === 'object' ? raw.studentId : null;
    const studentAssignmentObj: any =
      raw.studentAssignmentId && typeof raw.studentAssignmentId === 'object'
        ? raw.studentAssignmentId
        : null;
    const assignmentObj: any =
      studentAssignmentObj?.assignmentId && typeof studentAssignmentObj.assignmentId === 'object'
        ? studentAssignmentObj.assignmentId
        : null;
    const courseObj: any =
      assignmentObj?.courseId && typeof assignmentObj.courseId === 'object'
        ? assignmentObj.courseId
        : null;
    const actorObj: any = raw.actorId && typeof raw.actorId === 'object' ? raw.actorId : null;
    const reversedByObj: any =
      raw.reversedBy && typeof raw.reversedBy === 'object' ? raw.reversedBy : null;

    const studentName = studentObj?.fullName || studentObj?.name || studentObj?.email;
    const assignmentTitle = assignmentObj?.title || 'Bài tập';
    const courseTitle = courseObj
      ? `${courseObj.code ? courseObj.code + ' — ' : ''}${courseObj.title || ''}`
      : undefined;

    const isReversed = Boolean(
      raw.isReversed || raw.deltaPoints < 0 || raw.reversedTransactionId,
    );
    const reversedByName =
      reversedByObj?.fullName ||
      reversedByObj?.name ||
      reversedByObj?.email ||
      (raw.deltaPoints < 0 && actorObj ? (actorObj.fullName || actorObj.email) : undefined) ||
      (isReversed ? 'Quản trị viên' : undefined);

    const reversalReason =
      raw.reversalReason ||
      (typeof raw.reason === 'string' && raw.reason.startsWith('[REVERSAL] ')
        ? raw.reason.replace('[REVERSAL] ', '')
        : undefined);

    const occurredAt = raw.createdAt
      ? new Date(raw.createdAt).toISOString()
      : new Date().toISOString();

    const reversedAt = raw.reversedAt
      ? new Date(raw.reversedAt).toISOString()
      : isReversed && raw.updatedAt
        ? new Date(raw.updatedAt).toISOString()
        : undefined;

    return {
      id: extractObjectId(raw._id),
      studentId: extractObjectId(raw.studentId),
      studentName,
      student: studentObj || undefined,
      studentAssignmentId: extractObjectId(raw.studentAssignmentId),
      studentAssignment: studentAssignmentObj || undefined,
      assignmentId: assignmentObj ? extractObjectId(assignmentObj._id) : extractObjectId(raw.studentAssignmentId),
      assignmentTitle,
      courseTitle,
      deltaPoints: raw.deltaPoints,
      points: Math.abs(raw.deltaPoints ?? 1),
      reason: raw.reason,
      occurredAt,
      reversed: isReversed,
      isReversed,
      reversedAt,
      reversedBy: isReversed ? reversedByName : undefined,
      reversalReason,
      idempotencyKey: raw.idempotencyKey,
      actorId: raw.actorId ? extractObjectId(raw.actorId) : undefined,
      actor: actorObj || undefined,
      reversedTransactionId: raw.reversedTransactionId
        ? extractObjectId(raw.reversedTransactionId)
        : undefined,
      createdAt: raw.createdAt,
      createdAtVn: raw.createdAt ? formatVnDateTime(raw.createdAt) : undefined,
      updatedAt: raw.updatedAt,
    };
  }
}

