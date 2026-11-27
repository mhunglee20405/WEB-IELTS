import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { StudySessionsService } from './study-sessions.service';
import {
  StudentStudyDetailQueryDto,
  StudyHeartbeatDto,
  TeacherStudySummaryQueryDto,
} from './dto/study-session.dto';
import { StudentStudyDaily } from 'src/database/schemas/student-study-daily.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { EnrollmentStatus, UserRole } from 'src/database/schemas/enums';

function mockFindChain(result: any) {
  const exec = jest.fn().mockResolvedValue(result);
  const sort = jest.fn().mockReturnValue({ exec });
  const select = jest.fn().mockReturnValue({ sort, exec });
  const lean = jest.fn().mockReturnValue({ exec });
  return { sort, select, lean, exec };
}

describe('StudySessionsService', () => {
  let service: StudySessionsService;
  let studyDailyModelMock: any;
  let studentProfileModelMock: any;
  let courseModelMock: any;
  let enrollmentModelMock: any;

  const makeUser = (role: UserRole, id?: string) =>
    ({
      _id: new Types.ObjectId(id || '507f1f77bcf86cd799439011'),
      role,
      email: `${role}@example.com`,
      fullName: `Test ${role}`,
    }) as any;

  beforeEach(async () => {
    studyDailyModelMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    studentProfileModelMock = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn(),
    };
    courseModelMock = {
      find: jest.fn(),
      findById: jest.fn(),
    };
    enrollmentModelMock = {
      find: jest.fn(),
      findOne: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StudySessionsService,
        {
          provide: getModelToken(StudentStudyDaily.name),
          useValue: studyDailyModelMock,
        },
        {
          provide: getModelToken(StudentProfile.name),
          useValue: studentProfileModelMock,
        },
        {
          provide: getModelToken(Course.name),
          useValue: courseModelMock,
        },
        {
          provide: getModelToken(Enrollment.name),
          useValue: enrollmentModelMock,
        },
      ],
    }).compile();

    service = module.get<StudySessionsService>(StudySessionsService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('heartbeat', () => {
    it('credits deltaSeconds on first heartbeat, updates StudentProfile & StudentStudyDaily with VN date', async () => {
      // 2026-11-27T17:30:00.000Z === 2026-11-28T00:30:00+07:00 (VN date: 2026-11-28)
      const now = new Date('2026-11-27T17:30:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT, '507f1f77bcf86cd799439011');
      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      studentProfileModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 60,
          lastStudyHeartbeatAt: now,
        }),
      });
      studyDailyModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          studentId: student._id,
          dateVn: '2026-11-28',
          studySeconds: 60,
          heartbeatCount: 1,
          lastHeartbeatAt: now,
        }),
      });

      const result = await service.heartbeat({ deltaSeconds: 60 }, student);

      expect(studentProfileModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: student._id }),
        {
          $inc: { totalStudySeconds: 60 },
          $set: { lastStudyHeartbeatAt: now },
        },
        expect.objectContaining({ upsert: true, new: true }),
      );
      expect(studyDailyModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        { studentId: student._id, dateVn: '2026-11-28' },
        {
          $inc: { studySeconds: 60, heartbeatCount: 1 },
          $set: { lastHeartbeatAt: now },
        },
        { upsert: true, new: true },
      );
      expect(result).toEqual({
        accepted: true,
        creditedSeconds: 60,
        todayStudySeconds: 60,
        totalStudySeconds: 60,
      });
    });

    it('caps creditedSeconds at 90 on first heartbeat if deltaSeconds exceeds 90', async () => {
      const now = new Date('2026-11-27T07:00:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT);
      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 100,
          lastStudyHeartbeatAt: undefined,
        }),
      });
      studentProfileModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 190,
          lastStudyHeartbeatAt: now,
        }),
      });
      studyDailyModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          studentId: student._id,
          dateVn: '2026-11-27',
          studySeconds: 190,
          heartbeatCount: 2,
          lastHeartbeatAt: now,
        }),
      });

      const result = await service.heartbeat({ deltaSeconds: 150 }, student);

      expect(result).toEqual({
        accepted: true,
        creditedSeconds: 90,
        todayStudySeconds: 190,
        totalStudySeconds: 190,
      });
    });

    it('ignores rapid heartbeat < 15s after lastStudyHeartbeatAt without incrementing totals', async () => {
      const now = new Date('2026-11-27T07:00:10.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT);
      const lastBeat = new Date('2026-11-27T07:00:00.000Z'); // 10s ago

      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 420,
          lastStudyHeartbeatAt: lastBeat,
        }),
      });
      studyDailyModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          studentId: student._id,
          dateVn: '2026-11-27',
          studySeconds: 180,
        }),
      });

      const result = await service.heartbeat({ deltaSeconds: 60 }, student);

      expect(studentProfileModelMock.findOneAndUpdate).not.toHaveBeenCalled();
      expect(studyDailyModelMock.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        accepted: false,
        creditedSeconds: 0,
        todayStudySeconds: 180,
        totalStudySeconds: 420,
      });
    });

    it('credits only elapsed floor seconds (25s) when elapsed is 25s and deltaSeconds is 60', async () => {
      const now = new Date('2026-11-27T07:00:25.800Z');
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT);
      const lastBeat = new Date('2026-11-27T07:00:00.000Z'); // 25.8s ago

      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 100,
          lastStudyHeartbeatAt: lastBeat,
        }),
      });
      studentProfileModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 125,
          lastStudyHeartbeatAt: now,
        }),
      });
      studyDailyModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          studentId: student._id,
          dateVn: '2026-11-27',
          studySeconds: 125,
          heartbeatCount: 2,
          lastHeartbeatAt: now,
        }),
      });

      const result = await service.heartbeat({ deltaSeconds: 60 }, student);

      expect(studentProfileModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ userId: student._id }),
        {
          $inc: { totalStudySeconds: 25 },
          $set: { lastStudyHeartbeatAt: now },
        },
        expect.any(Object),
      );
      expect(studyDailyModelMock.findOneAndUpdate).toHaveBeenCalledWith(
        { studentId: student._id, dateVn: '2026-11-27' },
        {
          $inc: { studySeconds: 25, heartbeatCount: 1 },
          $set: { lastHeartbeatAt: now },
        },
        { upsert: true, new: true },
      );
      expect(result).toEqual({
        accepted: true,
        creditedSeconds: 25,
        todayStudySeconds: 125,
        totalStudySeconds: 125,
      });
    });

    it('returns accepted: false without double-crediting when concurrent request wins atomic update', async () => {
      const now = new Date('2026-11-27T07:01:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT);
      const staleBeat = new Date('2026-11-27T07:00:00.000Z');

      studentProfileModelMock.findOne
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            userId: student._id,
            totalStudySeconds: 100,
            lastStudyHeartbeatAt: staleBeat,
          }),
        })
        .mockReturnValueOnce({
          exec: jest.fn().mockResolvedValue({
            userId: student._id,
            totalStudySeconds: 160,
            lastStudyHeartbeatAt: now,
          }),
        });
      // Concurrent beat already updated lastStudyHeartbeatAt so atomic guard returns null
      studentProfileModelMock.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      studyDailyModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          studentId: student._id,
          dateVn: '2026-11-27',
          studySeconds: 160,
        }),
      });

      const result = await service.heartbeat({ deltaSeconds: 60 }, student);

      expect(studyDailyModelMock.findOneAndUpdate).not.toHaveBeenCalled();
      expect(result).toEqual({
        accepted: false,
        creditedSeconds: 0,
        todayStudySeconds: 160,
        totalStudySeconds: 160,
      });
    });

    it('rejects non-student callers with ForbiddenException', async () => {
      const teacher = makeUser(UserRole.TEACHER);
      await expect(service.heartbeat({ deltaSeconds: 60 }, teacher)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('getMySummary', () => {
    it('returns total, today, last7Days, lastActiveAt, and ascending dailyBreakdown within 14-day window', async () => {
      const now = new Date('2026-11-27T07:05:00.000Z'); // 2026-11-27 VN
      jest.useFakeTimers().setSystemTime(now);

      const student = makeUser(UserRole.STUDENT);
      const lastBeat = new Date('2026-11-27T07:05:00.000Z');

      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: student._id,
          totalStudySeconds: 42600,
          lastStudyHeartbeatAt: lastBeat,
        }),
      });

      const dailyChain = mockFindChain([
        { dateVn: '2026-11-27', studySeconds: 1860 },
        { dateVn: '2026-11-17', studySeconds: 2400 }, // 10 days ago: in 14d breakdown, NOT in 7d sum
        { dateVn: '2026-11-21', studySeconds: 3600 }, // 6 days ago: boundary included in 7d sum
      ]);
      studyDailyModelMock.find.mockReturnValue(dailyChain);

      const result = await service.getMySummary(student);

      expect(studyDailyModelMock.find).toHaveBeenCalledWith({
        studentId: student._id,
        dateVn: { $gte: '2026-11-14', $lte: '2026-11-27' },
      });
      expect(result).toEqual({
        totalStudySeconds: 42600,
        todayStudySeconds: 1860,
        last7DaysStudySeconds: 5460,
        lastActiveAt: '2026-11-27T07:05:00.000Z',
        dailyBreakdown: [
          { dateVn: '2026-11-17', studySeconds: 2400 },
          { dateVn: '2026-11-21', studySeconds: 3600 },
          { dateVn: '2026-11-27', studySeconds: 1860 },
        ],
      });
    });
  });

  describe('getTeacherSummary', () => {
    it('returns { items: [] } when teacher has 0 courses', async () => {
      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });

      const result = await service.getTeacherSummary({}, teacher);

      expect(courseModelMock.find).toHaveBeenCalledWith({ teacherId: teacher._id });
      expect(enrollmentModelMock.find).not.toHaveBeenCalled();
      expect(result).toEqual({ items: [] });
    });

    it('throws ForbiddenException when teacher requests an unowned courseId', async () => {
      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      const otherTeacherId = new Types.ObjectId('507f1f77bcf86cd799439021');
      const courseId = new Types.ObjectId('507f1f77bcf86cd799439030');

      courseModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: courseId,
          teacherId: otherTeacherId,
        }),
      });

      await expect(
        service.getTeacherSummary({ courseId: courseId.toHexString() }, teacher),
      ).rejects.toThrow(ForbiddenException);
      expect(enrollmentModelMock.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when requested courseId does not exist', async () => {
      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      const courseId = new Types.ObjectId().toHexString();

      courseModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(service.getTeacherSummary({ courseId }, teacher)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns deduplicated totalStudySeconds and last7DaysStudySeconds for enrolled students', async () => {
      const now = new Date('2026-11-27T07:05:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      const course1 = new Types.ObjectId('507f1f77bcf86cd799439031');
      const course2 = new Types.ObjectId('507f1f77bcf86cd799439032');
      const student1 = new Types.ObjectId('507f1f77bcf86cd799439041');
      const student2 = new Types.ObjectId('507f1f77bcf86cd799439042');
      const lastActive1 = new Date('2026-11-27T06:00:00.000Z');

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: course1, teacherId: teacher._id },
          { _id: course2, teacherId: teacher._id },
        ]),
      });
      enrollmentModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { courseId: course1, studentId: student1, status: EnrollmentStatus.ACTIVE },
          { courseId: course2, studentId: student1, status: EnrollmentStatus.ACTIVE },
          { courseId: course2, studentId: student2, status: EnrollmentStatus.ACTIVE },
        ]),
      });
      studentProfileModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            userId: student1,
            totalStudySeconds: 42600,
            lastStudyHeartbeatAt: lastActive1,
          },
        ]),
      });
      studyDailyModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { studentId: student1, dateVn: '2026-11-25', studySeconds: 7200 },
          { studentId: student1, dateVn: '2026-11-27', studySeconds: 1800 },
        ]),
      });

      const result = await service.getTeacherSummary({}, teacher);

      expect(enrollmentModelMock.find).toHaveBeenCalledWith({
        courseId: { $in: [course1, course2] },
        status: EnrollmentStatus.ACTIVE,
      });
      expect(studyDailyModelMock.find).toHaveBeenCalledWith({
        studentId: { $in: [student1, student2] },
        dateVn: { $gte: '2026-11-21', $lte: '2026-11-27' },
      });
      expect(result).toEqual({
        items: [
          {
            studentId: student1.toHexString(),
            totalStudySeconds: 42600,
            last7DaysStudySeconds: 9000,
            lastActiveAt: '2026-11-27T06:00:00.000Z',
          },
          {
            studentId: student2.toHexString(),
            totalStudySeconds: 0,
            last7DaysStudySeconds: 0,
            lastActiveAt: null,
          },
        ],
      });
    });

    it('allows ADMIN to query all student profiles when courseId is omitted', async () => {
      const now = new Date('2026-11-27T07:05:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const admin = makeUser(UserRole.ADMIN, '507f1f77bcf86cd799439099');
      const student1 = new Types.ObjectId('507f1f77bcf86cd799439041');

      studentProfileModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            userId: student1,
            totalStudySeconds: 5000,
            lastStudyHeartbeatAt: new Date('2026-11-27T05:00:00.000Z'),
          },
        ]),
      });
      studyDailyModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { studentId: student1, dateVn: '2026-11-27', studySeconds: 1200 },
        ]),
      });

      const result = await service.getTeacherSummary({}, admin);

      expect(courseModelMock.find).not.toHaveBeenCalled();
      expect(result).toEqual({
        items: [
          {
            studentId: student1.toHexString(),
            totalStudySeconds: 5000,
            last7DaysStudySeconds: 1200,
            lastActiveAt: '2026-11-27T05:00:00.000Z',
          },
        ],
      });
    });
  });

  describe('getStudentDetail', () => {
    it('throws BadRequestException for invalid studentId', async () => {
      const teacher = makeUser(UserRole.TEACHER);
      await expect(
        service.getStudentDetail('bad-id', { days: 14 }, teacher),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when student is not enrolled in teacher courses', async () => {
      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      const studentId = new Types.ObjectId('507f1f77bcf86cd799439041');
      const teacherCourseId = new Types.ObjectId('507f1f77bcf86cd799439031');

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: teacherCourseId }]),
      });
      enrollmentModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getStudentDetail(studentId.toHexString(), { days: 14 }, teacher),
      ).rejects.toThrow(ForbiddenException);
      expect(enrollmentModelMock.findOne).toHaveBeenCalledWith({
        courseId: { $in: [teacherCourseId] },
        studentId,
        status: EnrollmentStatus.ACTIVE,
      });
    });

    it('returns daily breakdown and totals when student is actively enrolled in teacher course', async () => {
      const now = new Date('2026-11-27T07:05:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const teacher = makeUser(UserRole.TEACHER, '507f1f77bcf86cd799439020');
      const studentId = new Types.ObjectId('507f1f77bcf86cd799439041');
      const teacherCourseId = new Types.ObjectId('507f1f77bcf86cd799439031');

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: teacherCourseId }]),
      });
      enrollmentModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          courseId: teacherCourseId,
          studentId,
          status: EnrollmentStatus.ACTIVE,
        }),
      });
      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          userId: studentId,
          totalStudySeconds: 12000,
          lastStudyHeartbeatAt: new Date('2026-11-27T06:30:00.000Z'),
        }),
      });
      studyDailyModelMock.find.mockReturnValue(
        mockFindChain([
          { dateVn: '2026-11-27', studySeconds: 900 },
          { dateVn: '2026-11-20', studySeconds: 1500 },
        ]),
      );

      const result = await service.getStudentDetail(
        studentId.toHexString(),
        { days: 14 },
        teacher,
      );

      expect(result).toEqual({
        totalStudySeconds: 12000,
        todayStudySeconds: 900,
        last7DaysStudySeconds: 900,
        lastActiveAt: '2026-11-27T06:30:00.000Z',
        dailyBreakdown: [
          { dateVn: '2026-11-20', studySeconds: 1500 },
          { dateVn: '2026-11-27', studySeconds: 900 },
        ],
      });
    });

    it('allows ADMIN to view any student detail without course enrollment check', async () => {
      const now = new Date('2026-11-27T07:05:00.000Z');
      jest.useFakeTimers().setSystemTime(now);

      const admin = makeUser(UserRole.ADMIN, '507f1f77bcf86cd799439099');
      const studentId = new Types.ObjectId('507f1f77bcf86cd799439041');

      studentProfileModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      studyDailyModelMock.find.mockReturnValue(mockFindChain([]));

      const result = await service.getStudentDetail(
        studentId.toHexString(),
        { days: 30 },
        admin,
      );

      expect(courseModelMock.find).not.toHaveBeenCalled();
      expect(studyDailyModelMock.find).toHaveBeenCalledWith({
        studentId,
        dateVn: { $gte: '2026-10-29', $lte: '2026-11-27' },
      });
      expect(result).toEqual({
        totalStudySeconds: 0,
        todayStudySeconds: 0,
        last7DaysStudySeconds: 0,
        lastActiveAt: null,
        dailyBreakdown: [],
      });
    });
  });

  describe('DTO validation', () => {
    it('rejects deltaSeconds: 9999 and deltaSeconds: 0 on StudyHeartbeatDto', async () => {
      const tooHigh = plainToInstance(StudyHeartbeatDto, { deltaSeconds: 9999 });
      const tooLow = plainToInstance(StudyHeartbeatDto, { deltaSeconds: 0 });
      const valid = plainToInstance(StudyHeartbeatDto, {
        deltaSeconds: '60',
        route: '/student/assignments',
      });

      expect((await validate(tooHigh)).map((e) => e.property)).toContain('deltaSeconds');
      expect((await validate(tooLow)).map((e) => e.property)).toContain('deltaSeconds');
      expect(valid.deltaSeconds).toBe(60);
      expect(await validate(valid)).toEqual([]);
    });

    it('validates TeacherStudySummaryQueryDto and StudentStudyDetailQueryDto', async () => {
      const badCourse = plainToInstance(TeacherStudySummaryQueryDto, {
        courseId: 'not-a-mongo-id',
      });
      expect((await validate(badCourse)).map((e) => e.property)).toContain('courseId');

      const badDaysLow = plainToInstance(StudentStudyDetailQueryDto, { days: '6' });
      const badDaysHigh = plainToInstance(StudentStudyDetailQueryDto, { days: '91' });
      const defaultDays = plainToInstance(StudentStudyDetailQueryDto, {});
      const validDays = plainToInstance(StudentStudyDetailQueryDto, { days: '30' });

      expect((await validate(badDaysLow)).map((e) => e.property)).toContain('days');
      expect((await validate(badDaysHigh)).map((e) => e.property)).toContain('days');
      expect(defaultDays.days).toBe(14);
      expect(await validate(defaultDays)).toEqual([]);
      expect(validDays.days).toBe(30);
      expect(await validate(validDays)).toEqual([]);
    });
  });
});
