import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
  Optional,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import {
  CourseStatus,
  CourseType,
  EnrollmentStatus,
  NotificationType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { AuditService } from 'src/modules/audit/audit.service';

@Injectable()
export class EnrollmentsService {
  private readonly logger = new Logger(EnrollmentsService.name);

  constructor(
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Optional() private notificationsService?: NotificationsService,
    @Optional() private auditService?: AuditService,
  ) {}

  /**
   * Enroll a student into a course.
   * - Admin: can enroll any active student into any non-archived course.
   * - Teacher: can only enroll into courses they teach.
   * - Prevents duplicate active enrollment (unique compound index + atomic transition).
   * - Enforces ONE_TO_ONE courses having at most one active student (partial unique index + pre-check).
   * - Maintains enrollment history on rejoin.
   */
  async enroll(
    courseId: string,
    studentId: string,
    actor: UserDocument,
  ): Promise<EnrollmentDocument> {
    if (!Types.ObjectId.isValid(courseId)) throw new NotFoundException('Course not found');
    if (!Types.ObjectId.isValid(studentId)) throw new NotFoundException('Student not found');

    const courseObjectId = new Types.ObjectId(courseId);
    const studentObjectId = new Types.ObjectId(studentId);

    const [course, student] = await Promise.all([
      this.courseModel.findById(courseObjectId).exec(),
      this.userModel
        .findOne({
          _id: studentObjectId,
          role: UserRole.STUDENT,
          status: UserStatus.ACTIVE,
        })
        .exec(),
    ]);

    if (!course) throw new NotFoundException('Course not found');
    if (course.status === CourseStatus.ARCHIVED) {
      throw new UnprocessableEntityException('Cannot enroll students into an archived course');
    }
    if (!student) {
      throw new UnprocessableEntityException('Student not found or is not an active student');
    }

    // Teacher ownership check
    if (actor.role === UserRole.TEACHER) {
      if (
        (course.teacherId as Types.ObjectId).toHexString() !==
        (actor._id as Types.ObjectId).toHexString()
      ) {
        throw new ForbiddenException('You can only enroll students into your own courses');
      }
    }

    const isOneToOne = course.type === CourseType.ONE_TO_ONE;

    // ONE_TO_ONE capacity check before write
    if (isOneToOne) {
      const activeCount = await this.enrollmentModel
        .countDocuments({
          courseId: courseObjectId,
          status: EnrollmentStatus.ACTIVE,
        })
        .exec();
      if (activeCount >= 1) {
        throw new ConflictException('ONE_TO_ONE course already has an active student');
      }
    }

    const now = new Date();
    const historyEntry = {
      status: EnrollmentStatus.ACTIVE,
      changedAt: now,
      actorId: actor._id as Types.ObjectId,
    };

    const existing = await this.enrollmentModel
      .findOne({
        courseId: courseObjectId,
        studentId: studentObjectId,
      })
      .exec();

    try {
      if (existing) {
        if (existing.status === EnrollmentStatus.ACTIVE) {
          throw new ConflictException('Student is already enrolled in this course');
        }

        // Atomic reactivation so concurrent rejoin requests cannot double-activate
        const reactivated = await this.enrollmentModel
          .findOneAndUpdate(
            {
              _id: existing._id,
              status: { $ne: EnrollmentStatus.ACTIVE },
            },
            {
              $set: {
                status: EnrollmentStatus.ACTIVE,
                joinedAt: now,
                ...(isOneToOne ? { isOneToOneActive: true } : {}),
              },
              $unset: { leftAt: '' },
              $push: { history: historyEntry },
            },
            { new: true },
          )
          .exec();

        if (!reactivated) {
          throw new ConflictException('Student is already enrolled in this course');
        }

        this.dispatchEnrollmentEvents(course, studentId, reactivated._id, actor);
        return reactivated;
      }

      const enrollment = new this.enrollmentModel({
        courseId: courseObjectId,
        studentId: studentObjectId,
        status: EnrollmentStatus.ACTIVE,
        joinedAt: now,
        ...(isOneToOne ? { isOneToOneActive: true } : {}),
        history: [historyEntry],
      });

      const saved = await enrollment.save();
      this.dispatchEnrollmentEvents(course, studentId, saved._id, actor);
      return saved;
    } catch (error: unknown) {
      if (this.isMongoDuplicateKeyError(error)) {
        const msg = (error as { message?: string }).message || '';
        if (msg.includes('unique_active_one_to_one_course') || msg.includes('isOneToOneActive')) {
          throw new ConflictException('ONE_TO_ONE course already has an active student');
        }
        throw new ConflictException('Student is already enrolled in this course');
      }
      throw error;
    }
  }

  /**
   * Drop (remove) a student from a course.
   * Atomically updates status to DROPPED, sets leftAt, unsets isOneToOneActive, and records history.
   * Never hard-deletes.
   */
  async drop(
    courseId: string,
    studentId: string,
    actor: UserDocument,
  ): Promise<{ message: string; enrollment: EnrollmentDocument }> {
    if (!Types.ObjectId.isValid(courseId)) throw new NotFoundException('Course not found');
    if (!Types.ObjectId.isValid(studentId)) throw new NotFoundException('Student not found');

    const course = await this.courseModel.findById(courseId).exec();
    if (!course) throw new NotFoundException('Course not found');

    // Teacher ownership check
    if (actor.role === UserRole.TEACHER) {
      if (
        (course.teacherId as Types.ObjectId).toHexString() !==
        (actor._id as Types.ObjectId).toHexString()
      ) {
        throw new ForbiddenException('You can only manage students in your own courses');
      }
    }

    const now = new Date();
    const updated = await this.enrollmentModel
      .findOneAndUpdate(
        {
          courseId: new Types.ObjectId(courseId),
          studentId: new Types.ObjectId(studentId),
          status: EnrollmentStatus.ACTIVE,
        },
        {
          $set: {
            status: EnrollmentStatus.DROPPED,
            leftAt: now,
          },
          $unset: { isOneToOneActive: '' },
          $push: {
            history: {
              status: EnrollmentStatus.DROPPED,
              changedAt: now,
              actorId: actor._id as Types.ObjectId,
            },
          },
        },
        { new: true },
      )
      .exec();

    if (!updated) {
      throw new NotFoundException('Active enrollment not found for this student in this course');
    }

    return { message: 'Student removed from course', enrollment: updated };
  }

  async findByStudent(
    studentId: string,
    page: number,
    limit: number,
  ): Promise<{ items: EnrollmentDocument[]; total: number; page: number; limit: number }> {
    const filter = { studentId: new Types.ObjectId(studentId), status: EnrollmentStatus.ACTIVE };

    const [items, total] = await Promise.all([
      this.enrollmentModel
        .find(filter)
        .populate({ path: 'courseId', populate: { path: 'teacherId', select: 'fullName email' } })
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ joinedAt: -1 })
        .exec(),
      this.enrollmentModel.countDocuments(filter).exec(),
    ]);

    return { items, total, page, limit };
  }

  private isMongoDuplicateKeyError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: number }).code === 11000
    );
  }

  private dispatchEnrollmentEvents(
    course: CourseDocument,
    studentId: string,
    enrollmentId: Types.ObjectId,
    actor: UserDocument,
  ) {
    if (this.notificationsService) {
      this.notificationsService
        .create({
          userId: studentId,
          type: NotificationType.COURSE_ENROLLED,
          title: `Ghi danh khóa học: ${course.title}`,
          body: `Bạn đã được thêm vào khóa học ${course.title} (${course.code}).`,
          payload: {
            courseId: course._id.toString(),
            code: course.code,
            title: course.title,
          },
          sendEmail: true,
          emailTemplateKey: 'course-enrolled',
        })
        .catch((err) => this.logger.warn(`Failed to notify enrollment: ${err.message}`));
    }

    if (this.auditService) {
      this.auditService
        .log({
          action: 'STUDENT_ENROLLED',
          entityType: 'Enrollment',
          entityId: enrollmentId,
          actorId: actor._id,
          metadata: {
            courseId: course._id.toString(),
            studentId,
          },
        })
        .catch((err) => this.logger.warn(`Failed to audit enrollment: ${err.message}`));
    }
  }
}
