import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { LessonsService } from './lessons.service';
import { Lesson } from 'src/database/schemas/lesson.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { CoursesService } from '../courses/courses.service';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  CourseStatus,
  LessonStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('LessonsService', () => {
  let service: LessonsService;
  let lessonModel: any;
  let courseModel: any;
  let enrollmentModel: any;
  let coursesService: jest.Mocked<CoursesService>;

  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const lessonId = new Types.ObjectId();

  const teacherAActor = {
    _id: teacherAId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherBActor = {
    _id: teacherBId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const studentActor = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const sampleCourse = {
    _id: courseId,
    teacherId: teacherAId,
    status: CourseStatus.ACTIVE,
  };

  const sampleLessonDoc = {
    _id: lessonId,
    courseId,
    title: 'Reading Lesson 1',
    startAt: new Date('2026-11-15T12:00:00.000Z'),
    endAt: new Date('2026-11-15T13:30:00.000Z'),
    meetUrl: 'https://meet.google.com/abc-defg-hij',
    content: 'Practice skimming',
    status: LessonStatus.SCHEDULED,
    toObject: function () {
      return { ...this };
    },
  };

  beforeEach(async () => {
    const lessonModelFactory: any = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: lessonId,
      toObject: () => ({ ...data, _id: lessonId }),
      save: jest.fn().mockResolvedValue({
        ...data,
        _id: lessonId,
        toObject: () => ({ ...data, _id: lessonId }),
      }),
    }));
    Object.assign(lessonModelFactory, {
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleLessonDoc) }),
        exec: jest.fn().mockResolvedValue(sampleLessonDoc),
      }),
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([sampleLessonDoc]) }),
            }),
          }),
        }),
        skip: jest.fn().mockReturnValue({
          limit: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([sampleLessonDoc]) }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleLessonDoc,
          status: LessonStatus.CANCELLED,
        }),
      }),
    });

    const mockCourseModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleCourse) }),
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ _id: courseId }]) }),
      }),
    };

    const mockEnrollmentModel = {
      find: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([{ courseId }]) }),
      }),
    };

    const mockCoursesService = {
      assertTeacherOwns: jest.fn((course: any, tId: string) => {
        if (course.teacherId.toHexString() !== tId) {
          throw new ForbiddenException('You do not have access to this course');
        }
      }),
      verifyCourseAccess: jest.fn().mockResolvedValue(sampleCourse),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LessonsService,
        { provide: getModelToken(Lesson.name), useValue: lessonModelFactory },
        { provide: getModelToken(Course.name), useValue: mockCourseModel },
        { provide: getModelToken(Enrollment.name), useValue: mockEnrollmentModel },
        { provide: CoursesService, useValue: mockCoursesService },
      ],
    }).compile();

    service = module.get<LessonsService>(LessonsService);
    lessonModel = module.get(getModelToken(Lesson.name));
    courseModel = module.get(getModelToken(Course.name));
    enrollmentModel = module.get(getModelToken(Enrollment.name));
    coursesService = module.get(CoursesService);
  });

  describe('create', () => {
    it('should create lesson with UTC dates and VN display times', async () => {
      const res = await service.create(
        courseId.toHexString(),
        {
          title: 'Reading Lesson 1',
          startAt: '2026-11-15T12:00:00.000Z',
          endAt: '2026-11-15T13:30:00.000Z',
          meetUrl: 'https://meet.google.com/abc-defg-hij',
          content: 'Practice skimming',
        },
        teacherAActor,
      );

      expect(res.timezone).toBe('Asia/Ho_Chi_Minh');
      expect(res.startAtVn).toBe('2026-11-15T19:00:00+07:00');
      expect(res.endAtVn).toBe('2026-11-15T20:30:00+07:00');
      expect(res.meetUrl).toBe('https://meet.google.com/abc-defg-hij');
    });

    it('should reject startAt >= endAt', async () => {
      await expect(
        service.create(
          courseId.toHexString(),
          {
            title: 'Invalid Time',
            startAt: '2026-11-15T14:00:00.000Z',
            endAt: '2026-11-15T13:00:00.000Z',
          },
          teacherAActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should forbid Teacher B from creating lesson in Teacher A course', async () => {
      await expect(
        service.create(
          courseId.toHexString(),
          {
            title: 'Unauthorized',
            startAt: '2026-11-15T12:00:00.000Z',
            endAt: '2026-11-15T13:00:00.000Z',
          },
          teacherBActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findMine', () => {
    it('should return enrolled lessons for student', async () => {
      const res = await service.findMine(studentActor, { page: 1, limit: 20 });
      expect(res.items).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it('should forbid student filtering by unenrolled courseId', async () => {
      const otherCourseId = new Types.ObjectId().toHexString();
      await expect(
        service.findMine(studentActor, { courseId: otherCourseId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject from > to date filter', async () => {
      await expect(
        service.findMine(studentActor, {
          from: '2026-11-20T00:00:00.000Z',
          to: '2026-11-10T00:00:00.000Z',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('cancel', () => {
    it('should soft-cancel scheduled lesson', async () => {
      const res = await service.cancel(lessonId.toHexString(), teacherAActor);
      expect(res.status).toBe(LessonStatus.CANCELLED);
    });

    it('should reject cancelling an already completed lesson', async () => {
      lessonModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleLessonDoc,
          status: LessonStatus.COMPLETED,
        }),
      });

      await expect(
        service.cancel(lessonId.toHexString(), teacherAActor),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });
});

