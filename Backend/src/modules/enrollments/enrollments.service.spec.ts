import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { EnrollmentsService } from './enrollments.service';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import {
  CourseStatus,
  CourseType,
  EnrollmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('EnrollmentsService', () => {
  let service: EnrollmentsService;
  let enrollmentModel: any;
  let courseModel: any;
  let userModel: any;

  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const studentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();

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

  const groupCourse = {
    _id: courseId,
    type: CourseType.GROUP,
    teacherId: teacherAId,
    status: CourseStatus.ACTIVE,
  };

  const oneToOneCourse = {
    _id: courseId,
    type: CourseType.ONE_TO_ONE,
    teacherId: teacherAId,
    status: CourseStatus.ACTIVE,
  };

  beforeEach(async () => {
    const enrollmentModelFactory: any = jest.fn().mockImplementation((data) => ({
      ...data,
      _id: new Types.ObjectId(),
      save: jest.fn().mockResolvedValue({ ...data, _id: new Types.ObjectId() }),
    }));
    Object.assign(enrollmentModelFactory, {
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
      countDocuments: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(0) }),
      findOneAndUpdate: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    });

    const mockCourseModel = {
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(groupCourse) }),
    };

    const mockUserModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: studentId, role: UserRole.STUDENT }),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentsService,
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModelFactory },
        { provide: getModelToken(Course.name), useValue: mockCourseModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
      ],
    }).compile();

    service = module.get<EnrollmentsService>(EnrollmentsService);
    enrollmentModel = module.get(getModelToken(Enrollment.name));
    courseModel = module.get(getModelToken(Course.name));
    userModel = module.get(getModelToken(User.name));
  });

  describe('enroll', () => {
    it('should enroll an active student into an owned GROUP course', async () => {
      const result = await service.enroll(
        courseId.toHexString(),
        studentId.toHexString(),
        teacherAActor,
      );
      expect(result.status).toBe(EnrollmentStatus.ACTIVE);
      expect(result.history).toHaveLength(1);
    });

    it('should forbid Teacher B from enrolling into Teacher A course', async () => {
      await expect(
        service.enroll(courseId.toHexString(), studentId.toHexString(), teacherBActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject inactive or missing student', async () => {
      userModel.findOne.mockReturnValue({ exec: jest.fn().mockResolvedValue(null) });
      await expect(
        service.enroll(courseId.toHexString(), studentId.toHexString(), teacherAActor),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should prevent duplicate active enrollment', async () => {
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ status: EnrollmentStatus.ACTIVE }),
      });

      await expect(
        service.enroll(courseId.toHexString(), studentId.toHexString(), teacherAActor),
      ).rejects.toThrow(ConflictException);
    });

    it('should enforce ONE_TO_ONE course max 1 active student', async () => {
      courseModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(oneToOneCourse) });
      enrollmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(1) });

      await expect(
        service.enroll(courseId.toHexString(), studentId.toHexString(), teacherAActor),
      ).rejects.toThrow(ConflictException);
    });

    it('should map Mongo 11000 concurrent ONE_TO_ONE collision to ConflictException', async () => {
      courseModel.findById.mockReturnValue({ exec: jest.fn().mockResolvedValue(oneToOneCourse) });
      enrollmentModel.countDocuments.mockReturnValue({ exec: jest.fn().mockResolvedValue(0) });
      enrollmentModel.mockImplementationOnce(() => ({
        save: jest.fn().mockRejectedValue({
          code: 11000,
          message: 'E11000 duplicate key error index: unique_active_one_to_one_course',
        }),
      }));

      await expect(
        service.enroll(courseId.toHexString(), studentId.toHexString(), teacherAActor),
      ).rejects.toThrow(ConflictException);
    });

    it('should reactivate a DROPPED student and preserve history', async () => {
      const droppedId = new Types.ObjectId();
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: droppedId, status: EnrollmentStatus.DROPPED }),
      });
      enrollmentModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: droppedId,
          status: EnrollmentStatus.ACTIVE,
          history: [{ status: EnrollmentStatus.DROPPED }, { status: EnrollmentStatus.ACTIVE }],
        }),
      });

      const res = await service.enroll(
        courseId.toHexString(),
        studentId.toHexString(),
        teacherAActor,
      );
      expect(res.status).toBe(EnrollmentStatus.ACTIVE);
      expect(res.history).toHaveLength(2);
    });
  });

  describe('drop', () => {
    it('should drop an active enrollment and record leftAt', async () => {
      enrollmentModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          status: EnrollmentStatus.DROPPED,
          leftAt: new Date(),
        }),
      });

      const res = await service.drop(
        courseId.toHexString(),
        studentId.toHexString(),
        teacherAActor,
      );
      expect(res.enrollment.status).toBe(EnrollmentStatus.DROPPED);
      expect(res.enrollment.leftAt).toBeDefined();
    });

    it('should throw NotFoundException if active enrollment does not exist', async () => {
      enrollmentModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.drop(courseId.toHexString(), studentId.toHexString(), teacherAActor),
      ).rejects.toThrow(NotFoundException);
    });
  });
});

