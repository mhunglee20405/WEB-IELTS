import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Lesson, LessonDocument } from 'src/database/schemas/lesson.schema';
import {
  CourseStatus,
  CourseType,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { CourseQueryDto } from './dto/course-query.dto';

export interface PaginatedCourses {
  items: CourseDocument[];
  total: number;
  page: number;
  limit: number;
}

/** Validate IELTS band: 0–9 in 0.5 steps */
function validateBand(value: number, fieldName: string): void {
  if (value < 0 || value > 9) {
    throw new BadRequestException(`${fieldName} must be between 0 and 9`);
  }
  if (Math.abs(value * 2 - Math.round(value * 2)) >= 1e-9) {
    throw new BadRequestException(`${fieldName} must be a multiple of 0.5`);
  }
}

/** Extract hex ObjectId safely whether field is populated or raw ObjectId */
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

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class CoursesService {
  constructor(
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Lesson.name) private lessonModel: Model<LessonDocument>,
  ) {}

  async create(dto: CreateCourseDto, actorId: string): Promise<CourseDocument> {
    validateBand(dto.startBand, 'startBand');
    validateBand(dto.targetBand, 'targetBand');

    const teacher = await this.userModel
      .findOne({
        _id: new Types.ObjectId(dto.teacherId),
        role: { $in: [UserRole.TEACHER, UserRole.ADMIN] },
        status: UserStatus.ACTIVE,
      })
      .exec();

    if (!teacher) {
      throw new UnprocessableEntityException('Giảng viên phụ trách không tồn tại hoặc tài khoản chưa kích hoạt');
    }

    const existing = await this.courseModel.findOne({ code: dto.code.toUpperCase() }).exec();
    if (existing) {
      throw new ConflictException(`Course code "${dto.code}" already exists`);
    }

    let courseType = dto.type;
    const rawType = dto.courseType || dto.type;
    if (rawType === '1:1' || rawType === 'one_to_one' || rawType === CourseType.ONE_TO_ONE) {
      courseType = CourseType.ONE_TO_ONE;
    } else {
      courseType = CourseType.GROUP;
    }

    const rawStart = dto.startAt || dto.startDate;
    const startAtDate = rawStart ? new Date(rawStart) : undefined;
    const rawEnd = dto.endAt || dto.endDate;
    const endAtDate = rawEnd ? new Date(rawEnd) : undefined;

    if (startAtDate && endAtDate && startAtDate >= endAtDate) {
      throw new BadRequestException('startAt must be before endAt');
    }

    const course = new this.courseModel({
      ...dto,
      type: courseType,
      code: dto.code.toUpperCase(),
      teacherId: new Types.ObjectId(dto.teacherId),
      createdBy: new Types.ObjectId(actorId),
      startAt: startAtDate,
      endAt: endAtDate,
    });

    try {
      return await course.save();
    } catch (error: unknown) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code?: number }).code === 11000
      ) {
        throw new ConflictException(`Course code "${dto.code}" already exists`);
      }
      throw error;
    }
  }

  async findAll(actor: UserDocument, query: CourseQueryDto): Promise<PaginatedCourses> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};

    if (actor.role === UserRole.TEACHER) {
      filter['teacherId'] = actor._id;
    } else if (actor.role === UserRole.STUDENT) {
      return this.findMine(actor, query);
    }

    if (query.status) filter['status'] = query.status;
    if (query.type) filter['type'] = query.type;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter['$or'] = [{ code: regex }, { title: regex }];
    }

    const [items, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .populate('teacherId', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.courseModel.countDocuments(filter).exec(),
    ]);

    const formattedItems = items.map((c: any) => {
      const raw = typeof c.toObject === 'function' ? c.toObject() : c;
      const teacher = raw.teacherId;
      const teacherIdStr =
        teacher && typeof teacher === 'object'
          ? (teacher._id || teacher.id)?.toString()
          : teacher?.toString() || '';
      const teacherNameStr =
        teacher && typeof teacher === 'object' ? teacher.fullName : undefined;
      return {
        ...raw,
        id: (raw._id || raw.id)?.toString(),
        teacherId: teacherIdStr,
        teacherName: teacherNameStr,
      };
    });

    return { items: formattedItems as any, total, page, limit };
  }

  async findMine(student: UserDocument, query: CourseQueryDto): Promise<PaginatedCourses> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    const enrollments = await this.enrollmentModel
      .find({ studentId: student._id, status: EnrollmentStatus.ACTIVE })
      .select('courseId')
      .exec();

    const courseIds = enrollments.map((e) => e.courseId);
    const filter: Record<string, unknown> = { _id: { $in: courseIds } };

    if (query.status) filter['status'] = query.status;
    if (query.type) filter['type'] = query.type;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter['$or'] = [{ code: regex }, { title: regex }];
    }

    const [items, total] = await Promise.all([
      this.courseModel
        .find(filter)
        .populate('teacherId', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.courseModel.countDocuments(filter).exec(),
    ]);

    const formattedItems = items.map((c: any) => {
      const raw = typeof c.toObject === 'function' ? c.toObject() : c;
      const teacher = raw.teacherId;
      const teacherIdStr =
        teacher && typeof teacher === 'object'
          ? (teacher._id || teacher.id)?.toString()
          : teacher?.toString() || '';
      const teacherNameStr =
        teacher && typeof teacher === 'object' ? teacher.fullName : undefined;
      return {
        ...raw,
        id: (raw._id || raw.id)?.toString(),
        teacherId: teacherIdStr,
        teacherName: teacherNameStr,
      };
    });

    return { items: formattedItems as any, total, page, limit };
  }

  async findById(id: string, actor: UserDocument): Promise<CourseDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Course not found');

    const course = await this.courseModel
      .findById(id)
      .populate('teacherId', 'fullName email')
      .exec();

    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.STUDENT) {
      await this.assertStudentEnrolled(id, (actor._id as Types.ObjectId).toHexString());
    }

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
    }

    return course;
  }

  async update(id: string, dto: UpdateCourseDto, actor: UserDocument): Promise<CourseDocument> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Course not found');

    const course = await this.courseModel.findById(id).exec();
    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
      if (dto.teacherId) {
        throw new ForbiddenException('Teachers cannot reassign course ownership');
      }
      if (dto.status === CourseStatus.ARCHIVED) {
        throw new ForbiddenException('Only Admin can archive courses');
      }
    }

    if (dto.teacherId) {
      const teacher = await this.userModel
        .findOne({
          _id: new Types.ObjectId(dto.teacherId),
          role: { $in: [UserRole.TEACHER, UserRole.ADMIN] },
          status: UserStatus.ACTIVE,
        })
        .exec();
      if (!teacher) {
        throw new UnprocessableEntityException('Giảng viên phụ trách không tồn tại hoặc tài khoản chưa kích hoạt');
      }
    }

    const rawType = dto.courseType || dto.type;
    let effectiveType = dto.type;
    if (rawType) {
      effectiveType =
        rawType === '1:1' || rawType === 'one_to_one' || rawType === CourseType.ONE_TO_ONE
          ? CourseType.ONE_TO_ONE
          : CourseType.GROUP;
    }

    if (effectiveType === CourseType.ONE_TO_ONE && course.type !== CourseType.ONE_TO_ONE) {
      const activeCount = await this.enrollmentModel
        .countDocuments({
          courseId: new Types.ObjectId(id),
          status: EnrollmentStatus.ACTIVE,
        })
        .exec();
      if (activeCount > 1) {
        throw new ConflictException(
          'Cannot switch course to ONE_TO_ONE while multiple students are actively enrolled',
        );
      }
    }

    if (dto.startBand !== undefined) validateBand(dto.startBand, 'startBand');
    if (dto.targetBand !== undefined) validateBand(dto.targetBand, 'targetBand');

    const rawUpdateStart = dto.startAt || dto.startDate;
    const startAt = rawUpdateStart ? new Date(rawUpdateStart) : course.startAt;
    const rawUpdateEnd = dto.endAt || dto.endDate;
    const endAt = rawUpdateEnd ? new Date(rawUpdateEnd) : course.endAt;
    if (startAt && endAt && startAt >= endAt) {
      throw new BadRequestException('startAt must be before endAt');
    }

    const updatePayload: Record<string, unknown> = { ...dto };
    if (effectiveType) updatePayload['type'] = effectiveType;
    delete updatePayload['courseType'];
    delete updatePayload['startDate'];
    delete updatePayload['endDate'];
    delete updatePayload['timezone'];
    if (dto.teacherId) updatePayload['teacherId'] = new Types.ObjectId(dto.teacherId);
    if (startAt) updatePayload['startAt'] = startAt;
    if (endAt) updatePayload['endAt'] = endAt;

    const updated = await this.courseModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .populate('teacherId', 'fullName email')
      .exec();

    return updated!;
  }

  /**
   * Archive or safely delete a course (Admin only).
   * - Never hard-deletes courses with active enrollments or assignment/enrollment/lesson history.
   * - Rejects deletion/archiving if active enrollments exist.
   */
  async remove(
    id: string,
  ): Promise<{ archived?: boolean; deleted?: boolean; message: string; course?: CourseDocument }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Course not found');

    const courseObjectId = new Types.ObjectId(id);
    const course = await this.courseModel.findById(courseObjectId).exec();
    if (!course) throw new NotFoundException('Course not found');

    const [activeEnrollments, totalEnrollments, assignmentCount, lessonCount] = await Promise.all([
      this.enrollmentModel
        .countDocuments({ courseId: courseObjectId, status: EnrollmentStatus.ACTIVE })
        .exec(),
      this.enrollmentModel.countDocuments({ courseId: courseObjectId }).exec(),
      this.assignmentModel.countDocuments({ courseId: courseObjectId }).exec(),
      this.lessonModel.countDocuments({ courseId: courseObjectId }).exec(),
    ]);

    if (activeEnrollments > 0) {
      throw new ConflictException(
        'Cannot delete or archive a course with active enrollments. Remove active students first.',
      );
    }

    const hasHistory =
      totalEnrollments > 0 ||
      assignmentCount > 0 ||
      lessonCount > 0 ||
      course.status !== CourseStatus.DRAFT;

    if (hasHistory) {
      const archivedCourse = await this.courseModel
        .findByIdAndUpdate(
          courseObjectId,
          { $set: { status: CourseStatus.ARCHIVED } },
          { new: true },
        )
        .populate('teacherId', 'fullName email')
        .exec();

      return {
        archived: true,
        message: 'Course archived to preserve history',
        course: archivedCourse!,
      };
    }

    await this.courseModel.deleteOne({ _id: courseObjectId }).exec();
    return {
      deleted: true,
      message: 'Unused draft course deleted',
    };
  }

  async getStudents(
    courseId: string,
    actor: UserDocument,
    page: number,
    limit: number,
    status: EnrollmentStatus = EnrollmentStatus.ACTIVE,
  ): Promise<{ items: unknown[]; total: number; page: number; limit: number }> {
    if (!Types.ObjectId.isValid(courseId)) throw new NotFoundException('Course not found');

    const course = await this.courseModel.findById(courseId).exec();
    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
    }

    const filter = { courseId: new Types.ObjectId(courseId), status };

    const [enrollments, total] = await Promise.all([
      this.enrollmentModel
        .find(filter)
        .populate('studentId', 'fullName email phone')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ joinedAt: 1 })
        .exec(),
      this.enrollmentModel.countDocuments(filter).exec(),
    ]);

    const items = enrollments.map((e) => ({
      enrollmentId: (e._id as Types.ObjectId).toHexString(),
      student: e.studentId,
      joinedAt: e.joinedAt,
      leftAt: e.leftAt,
      status: e.status,
      history: e.history,
    }));

    return { items, total, page, limit };
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  assertTeacherOwns(course: CourseDocument, teacherId: string): void {
    if (extractObjectId(course.teacherId) !== teacherId) {
      throw new ForbiddenException('You do not have access to this course');
    }
  }

  async assertStudentEnrolled(courseId: string, studentId: string): Promise<void> {
    const enrollment = await this.enrollmentModel
      .findOne({
        courseId: new Types.ObjectId(courseId),
        studentId: new Types.ObjectId(studentId),
        status: EnrollmentStatus.ACTIVE,
      })
      .exec();

    if (!enrollment) {
      throw new ForbiddenException('You are not enrolled in this course');
    }
  }

  async verifyCourseAccess(courseId: string, actor: UserDocument): Promise<CourseDocument> {
    return this.findById(courseId, actor);
  }
}
