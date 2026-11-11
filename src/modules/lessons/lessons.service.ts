import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Lesson, LessonDocument } from 'src/database/schemas/lesson.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentDocument } from 'src/database/schemas/enrollment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  CourseStatus,
  EnrollmentStatus,
  LessonStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { TIMEZONE_VN } from 'src/common/constants';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { CoursesService, extractObjectId } from '../courses/courses.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonQueryDto } from './dto/lesson-query.dto';

export interface LessonResponse {
  id: string;
  courseId: unknown;
  title: string;
  startAt: Date;
  endAt: Date;
  startAtVn: string;
  endAtVn: string;
  timezone: string;
  meetUrl?: string;
  content?: string;
  status: LessonStatus;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PaginatedLessons {
  items: LessonResponse[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class LessonsService {
  constructor(
    @InjectModel(Lesson.name) private lessonModel: Model<LessonDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(Enrollment.name) private enrollmentModel: Model<EnrollmentDocument>,
    private readonly coursesService: CoursesService,
  ) {}

  async create(
    courseId: string,
    dto: CreateLessonDto,
    actor: UserDocument,
  ): Promise<LessonResponse> {
    if (!Types.ObjectId.isValid(courseId)) throw new NotFoundException('Course not found');

    const course = await this.courseModel.findById(courseId).exec();
    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.TEACHER) {
      this.coursesService.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
    }

    if (course.status === CourseStatus.ARCHIVED) {
      throw new UnprocessableEntityException('Cannot create lessons in an archived course');
    }

    const startAt = new Date(dto.startAt);
    const endAt = new Date(dto.endAt);
    this.validateTimeRange(startAt, endAt);

    const lesson = new this.lessonModel({
      courseId: new Types.ObjectId(courseId),
      title: dto.title,
      startAt,
      endAt,
      meetUrl: dto.meetUrl,
      content: dto.content,
      status: dto.status ?? LessonStatus.SCHEDULED,
    });

    const saved = await lesson.save();
    return this.mapLesson(saved);
  }

  async findByCourse(
    courseId: string,
    actor: UserDocument,
    query: LessonQueryDto,
  ): Promise<PaginatedLessons> {
    await this.coursesService.verifyCourseAccess(courseId, actor);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter = this.buildFilter({ ...query, courseId });

    const [docs, total] = await Promise.all([
      this.lessonModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ startAt: 1 })
        .exec(),
      this.lessonModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.mapLesson(d)),
      total,
      page,
      limit,
    };
  }

  async findMine(actor: UserDocument, query: LessonQueryDto): Promise<PaginatedLessons> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;

    let allowedCourseIds: Types.ObjectId[] | null = null;

    if (actor.role === UserRole.STUDENT) {
      const enrollments = await this.enrollmentModel
        .find({ studentId: actor._id, status: EnrollmentStatus.ACTIVE })
        .select('courseId')
        .exec();
      allowedCourseIds = enrollments.map((e) => e.courseId as Types.ObjectId);
    } else if (actor.role === UserRole.TEACHER) {
      const courses = await this.courseModel
        .find({ teacherId: actor._id })
        .select('_id')
        .exec();
      allowedCourseIds = courses.map((c) => c._id as Types.ObjectId);
    }

    if (allowedCourseIds !== null && query.courseId) {
      const requestedAllowed = allowedCourseIds.some(
        (id) => id.toHexString() === query.courseId,
      );
      if (!requestedAllowed) {
        throw new ForbiddenException('You do not have access to lessons for this course');
      }
    }

    const filter = this.buildFilter(query);
    if (!query.courseId && allowedCourseIds !== null) {
      filter['courseId'] = { $in: allowedCourseIds };
    }

    const [docs, total] = await Promise.all([
      this.lessonModel
        .find(filter)
        .populate('courseId', 'code title teacherId')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ startAt: 1 })
        .exec(),
      this.lessonModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.mapLesson(d)),
      total,
      page,
      limit,
    };
  }

  async findById(id: string, actor: UserDocument): Promise<LessonResponse> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lesson not found');

    const lesson = await this.lessonModel
      .findById(id)
      .populate('courseId', 'code title teacherId')
      .exec();
    if (!lesson) throw new NotFoundException('Lesson not found');

    const courseId = extractObjectId(lesson.courseId);
    await this.coursesService.verifyCourseAccess(courseId, actor);

    return this.mapLesson(lesson);
  }

  async update(
    id: string,
    dto: UpdateLessonDto,
    actor: UserDocument,
  ): Promise<LessonResponse> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lesson not found');

    const lesson = await this.lessonModel.findById(id).exec();
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.courseModel.findById(lesson.courseId).exec();
    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.TEACHER) {
      this.coursesService.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
    }

    const startAt = dto.startAt ? new Date(dto.startAt) : lesson.startAt;
    const endAt = dto.endAt ? new Date(dto.endAt) : lesson.endAt;
    this.validateTimeRange(startAt, endAt);

    const updatePayload: Record<string, unknown> = { ...dto };
    if (dto.startAt) updatePayload['startAt'] = startAt;
    if (dto.endAt) updatePayload['endAt'] = endAt;

    const updated = await this.lessonModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .exec();

    return this.mapLesson(updated!);
  }

  async cancel(id: string, actor: UserDocument): Promise<LessonResponse> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Lesson not found');

    const lesson = await this.lessonModel.findById(id).exec();
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = await this.courseModel.findById(lesson.courseId).exec();
    if (!course) throw new NotFoundException('Course not found');

    if (actor.role === UserRole.TEACHER) {
      this.coursesService.assertTeacherOwns(course, (actor._id as Types.ObjectId).toHexString());
    }

    if (lesson.status === LessonStatus.COMPLETED) {
      throw new UnprocessableEntityException('Cannot cancel a completed lesson');
    }

    const cancelled = await this.lessonModel
      .findByIdAndUpdate(id, { $set: { status: LessonStatus.CANCELLED } }, { new: true })
      .exec();

    return this.mapLesson(cancelled!);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private validateTimeRange(startAt: Date, endAt: Date): void {
    if (Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())) {
      throw new BadRequestException('Invalid startAt or endAt date');
    }
    if (startAt >= endAt) {
      throw new BadRequestException('startAt must be strictly before endAt');
    }
  }

  private buildFilter(query: LessonQueryDto): Record<string, unknown> {
    const filter: Record<string, unknown> = {};

    if (query.courseId) {
      filter['courseId'] = new Types.ObjectId(query.courseId);
    }
    if (query.status) {
      filter['status'] = query.status;
    }

    if (query.from || query.to) {
      const fromDate = query.from ? new Date(query.from) : undefined;
      const toDate = query.to ? new Date(query.to) : undefined;
      if (fromDate && toDate && fromDate > toDate) {
        throw new BadRequestException('from date must be before or equal to to date');
      }
      const range: Record<string, Date> = {};
      if (fromDate) range['$gte'] = fromDate;
      if (toDate) range['$lte'] = toDate;
      filter['startAt'] = range;
    }

    return filter;
  }

  private mapLesson(lesson: LessonDocument): LessonResponse {
    const obj = lesson.toObject();
    return {
      id: (lesson._id as Types.ObjectId).toHexString(),
      courseId: obj.courseId,
      title: obj.title,
      startAt: obj.startAt,
      endAt: obj.endAt,
      startAtVn: formatVnDateTime(obj.startAt),
      endAtVn: formatVnDateTime(obj.endAt),
      timezone: TIMEZONE_VN,
      meetUrl: obj.meetUrl,
      content: obj.content,
      status: obj.status,
      createdAt: obj.createdAt,
      updatedAt: obj.updatedAt,
    };
  }
}

