import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { CoursesService } from './courses.service';
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Lesson } from 'src/database/schemas/lesson.schema';
import {
  CourseStatus,
  CourseType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('CoursesService', () => {
  let service: CoursesService;
  let courseModel: any;
  let enrollmentModel: any;
  let userModel: any;
  let assignmentModel: any;
  let lessonModel: any;

  const adminId = new Types.ObjectId();
  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();

  const adminActor = {
    _id: adminId,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

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
    code: 'IELTS-01',
    title: 'IELTS Foundation',
    startBand: 5.0,
    targetBand: 6.5,
    type: CourseType.GROUP,
    teacherId: teacherAId,
    status: CourseStatus.ACTIVE,
    createdBy: adminId,
  };

  beforeEach(async () => {
    const courseModelFactory: any = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: courseId,
      save: jest.fn().mockResolvedValue({ ...data, _id: courseId }),
    }));
    Object.assign(courseModelFactory, {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      findById: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleCourse) }),
        exec: jest.fn().mockResolvedValue(sampleCourse),
      }),
      find: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({
          skip: jest.fn().mockReturnValue({
            limit: jest.fn().mockReturnValue({
              sort: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue([sampleCourse]),
              }),
            }),
          }),
        }),
      }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(1) }),
      findByIdAndUpdate: jest.fn().mockReturnValue({
        populate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleCourse) }),
      }),
      deleteOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue({ deletedCount: 1 }) }),
    });

    const mockEnrollmentModel = {
      find: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }) }),
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };

    const mockUserModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: teacherAId, role: UserRole.TEACHER }),
      }),
    };

    const mockAssignmentModel = {
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };

    const mockLessonModel = {
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CoursesService,
        { provide: getModelToken(Course.name), useValue: courseModelFactory },
        { provide: getModelToken(Enrollment.name), useValue: mockEnrollmentModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Assignment.name), useValue: mockAssignmentModel },
        { provide: getModelToken(Lesson.name), useValue: mockLessonModel },
      ],
    }).compile();

    service = module.get<CoursesService>(CoursesService);
    courseModel = module.get(getModelToken(Course.name));
    enrollmentModel = module.get(getModelToken(Enrollment.name));
    userModel = module.get(getModelToken(User.name));
    assignmentModel = module.get(getModelToken(Assignment.name));
    lessonModel = module.get(getModelToken(Lesson.name));
  });

  describe('create', () => {
    it('should create course with valid 0.5-increment IELTS bands', async () => {
      const result = await service.create(
        {
          code: 'ielts-01',
          title: 'IELTS Foundation',
          startBand: 5.5,
          targetBand: 7.0,
          type: CourseType.GROUP,
          teacherId: teacherAId.toHexString(),
        },
        adminId.toHexString(),
      );
      expect(result.code).toBe('IELTS-01');
    });

    it('should reject invalid band increment (e.g. 5.3)', async () => {
      await expect(
        service.create(
          {
            code: 'IELTS-02',
            title: 'Bad Band',
            startBand: 5.3,
            targetBand: 7.0,
            type: CourseType.GROUP,
            teacherId: teacherAId.toHexString(),
          },
          adminId.toHexString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject out-of-range band (> 9 or < 0)', async () => {
      await expect(
        service.create(
          {
            code: 'IELTS-02',
            title: 'Bad Band',
            startBand: 5.0,
            targetBand: 9.5,
            type: CourseType.GROUP,
            teacherId: teacherAId.toHexString(),
          },
          adminId.toHexString(),
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject duplicate course code', async () => {
      courseModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(sampleCourse) });
      await expect(
        service.create(
          {
            code: 'IELTS-01',
            title: 'Dup',
            startBand: 5.0,
            targetBand: 6.5,
            type: CourseType.GROUP,
            teacherId: teacherAId.toHexString(),
          },
          adminId.toHexString(),
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject non-existent or non-teacher teacherId', async () => {
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(
        service.create(
          {
            code: 'IELTS-03',
            title: 'No Teacher',
            startBand: 5.0,
            targetBand: 6.5,
            type: CourseType.GROUP,
            teacherId: teacherAId.toHexString(),
          },
          adminId.toHexString(),
        ),
      ).rejects.toThrow(UnprocessableEntityException);
    });
  });

  describe('RBAC & Ownership', () => {
    it('should prevent Teacher B from viewing Teacher A course', async () => {
      await expect(
        service.findById(courseId.toHexString(), teacherBActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent Teacher B from updating Teacher A course', async () => {
      await expect(
        service.update(courseId.toHexString(), { title: 'Hacked' }, teacherBActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent Teacher A from reassigning teacherId', async () => {
      await expect(
        service.update(
          courseId.toHexString(),
          { teacherId: teacherBId.toHexString() },
          teacherAActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should prevent Student from viewing unenrolled course', async () => {
      enrollmentModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(
        service.findById(courseId.toHexString(), studentActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow Student to view actively enrolled course', async () => {
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
      });
      const course = await service.findById(courseId.toHexString(), studentActor);
      expect(course.code).toBe('IELTS-01');
    });

    it('should throw NotFoundException for invalid ObjectId', async () => {
      await expect(service.findById('bad-id', adminActor)).rejects.toThrow(NotFoundException);
    });
  });

  describe('remove (no hard-delete with history)', () => {
    it('should throw ConflictException when active enrollments exist', async () => {
      enrollmentModel.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(2) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(2) });

      await expect(service.remove(courseId.toHexString())).rejects.toThrow(ConflictException);
      expect(courseModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should archive instead of hard-deleting when assignment history exists', async () => {
      enrollmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      assignmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(3) });

      const result = await service.remove(courseId.toHexString());
      expect(result.archived).toBe(true);
      expect(courseModel.deleteOne).not.toHaveBeenCalled();
    });

    it('should allow deleting unused draft course with no history', async () => {
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleCourse, status: CourseStatus.DRAFT }),
      });
      enrollmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      assignmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      lessonModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });

      const result = await service.remove(courseId.toHexString());
      expect(result.deleted).toBe(true);
      expect(courseModel.deleteOne).toHaveBeenCalled();
    });
  });
});

