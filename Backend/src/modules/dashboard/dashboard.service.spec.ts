import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { Lesson } from 'src/database/schemas/lesson.schema';
import { ExtensionRequest } from 'src/database/schemas/extension-request.schema';
import { PenaltyTransaction } from 'src/database/schemas/penalty-transaction.schema';
import { Notification } from 'src/database/schemas/notification.schema';
import { TranslationSubmission } from 'src/database/schemas/translation-submission.schema';
import { StudentProfile } from 'src/database/schemas/student-profile.schema';
import { TeacherProfile } from 'src/database/schemas/teacher-profile.schema';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExtensionRequestStatus,
  StudentAssignmentStatus,
  TranslationSubmissionStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';
import { createVnMonthBounds } from 'src/common/utils/timezone.util';

function chain(val: any) {
  const q: any = {
    populate: jest.fn().mockImplementation(() => q),
    select: jest.fn().mockImplementation(() => q),
    sort: jest.fn().mockImplementation(() => q),
    limit: jest.fn().mockImplementation(() => q),
    exec: jest.fn().mockResolvedValue(val),
  };
  return q;
}

describe('DashboardService & DashboardController', () => {
  let service: DashboardService;
  let controller: DashboardController;
  let studentAssignmentModel: any;
  let assignmentModel: any;
  let courseModel: any;
  let enrollmentModel: any;
  let lessonModel: any;
  let extensionModel: any;
  let penaltyModel: any;
  let notificationModel: any;
  let translationModel: any;
  let studentProfileModel: any;
  let teacherProfileModel: any;
  let examTestModel: any;

  const studentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const testId = new Types.ObjectId();

  const studentActor = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
    fullName: 'Student One',
    email: 's1@test.com',
  } as unknown as UserDocument;

  const teacherActor = {
    _id: teacherId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
    fullName: 'Teacher One',
    email: 't1@test.com',
  } as unknown as UserDocument;

  const adminActor = {
    _id: adminId,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
    fullName: 'Admin One',
    email: 'admin@test.com',
  } as unknown as UserDocument;

  beforeEach(async () => {
    studentAssignmentModel = {
      find: jest.fn().mockReturnValue(chain([])),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    assignmentModel = {
      find: jest.fn().mockReturnValue(chain([])),
    };
    courseModel = {
      find: jest.fn().mockReturnValue(chain([])),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    enrollmentModel = {
      find: jest.fn().mockReturnValue(chain([])),
      findOne: jest.fn().mockReturnValue(chain(null)),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    lessonModel = {
      find: jest.fn().mockReturnValue(chain([])),
    };
    extensionModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    penaltyModel = {
      find: jest.fn().mockReturnValue(chain([])),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    notificationModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    translationModel = {
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    studentProfileModel = {
      findOne: jest.fn().mockReturnValue(chain({ targetBand: 7.5 })),
    };
    teacherProfileModel = {
      findOne: jest.fn().mockReturnValue(chain(null)),
    };
    examTestModel = {
      find: jest.fn().mockReturnValue(chain([])),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [DashboardController],
      providers: [
        DashboardService,
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getModelToken(Lesson.name), useValue: lessonModel },
        { provide: getModelToken(ExtensionRequest.name), useValue: extensionModel },
        { provide: getModelToken(PenaltyTransaction.name), useValue: penaltyModel },
        { provide: getModelToken(Notification.name), useValue: notificationModel },
        { provide: getModelToken(TranslationSubmission.name), useValue: translationModel },
        { provide: getModelToken(StudentProfile.name), useValue: studentProfileModel },
        { provide: getModelToken(TeacherProfile.name), useValue: teacherProfileModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
      ],
    }).compile();

    service = module.get<DashboardService>(DashboardService);
    controller = module.get<DashboardController>(DashboardController);
  });

  describe('getStudentPenalties', () => {
    it('rejects teacher when student is not enrolled in any of teacher courses', async () => {
      courseModel.find.mockReturnValue(chain([{ _id: courseId }]));
      enrollmentModel.findOne.mockReturnValue(chain(null));

      await expect(
        controller.getStudentPenalties(studentId.toHexString(), teacherActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows teacher when student is actively enrolled in one of teacher courses', async () => {
      courseModel.find.mockReturnValue(chain([{ _id: courseId }]));
      enrollmentModel.findOne.mockReturnValue(chain({ _id: new Types.ObjectId(), studentId }));
      penaltyModel.find.mockReturnValue(chain([]));

      const res = await controller.getStudentPenalties(studentId.toHexString(), teacherActor);
      expect(res.totalPoints).toBe(0);
    });

    it('allows admin to view any student penalties', async () => {
      penaltyModel.find.mockReturnValue(chain([]));

      const res = await controller.getStudentPenalties(studentId.toHexString(), adminActor);
      expect(res.records).toEqual([]);
      expect(courseModel.find).not.toHaveBeenCalled();
    });

    it('throws NotFoundException for invalid studentId', async () => {
      await expect(
        controller.getStudentPenalties('invalid-id', adminActor),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getStudentDashboard', () => {
    it('does not query lessons when student has 0 active enrollments', async () => {
      enrollmentModel.find.mockReturnValue(chain([]));

      const res = await service.getStudentDashboard(studentActor);

      expect(res.upcomingLessons).toEqual([]);
      expect(lessonModel.find).not.toHaveBeenCalled();
    });

    it('maps penaltyApplied from penaltyAppliedAt, submittedAt from lastSubmittedAt, and respects targetScorePercent', async () => {
      const submittedDate = new Date('2026-11-10T08:30:00.000Z');
      const penaltyDate = new Date('2026-11-12T00:00:00.000Z');
      studentAssignmentModel.find.mockReturnValue(
        chain([
          {
            _id: new Types.ObjectId(),
            assignmentId: {
              _id: assignmentId,
              title: 'Reading 1',
              openAt: new Date('2026-11-09T23:00:00.000Z'),
              deadlineAt: new Date('2026-11-10T23:00:00.000Z'),
              targetScorePercent: 80,
              courseId: { _id: courseId, code: 'C1', title: 'Course 1' },
              exerciseId: { _id: new Types.ObjectId(), title: 'Ex1', type: 'reading' },
            },
            status: StudentAssignmentStatus.SUBMITTED,
            bestScore: 75,
            isTargetAchieved: false,
            lastSubmittedAt: submittedDate,
            penaltyAppliedAt: penaltyDate,
          },
        ]),
      );

      const res = await service.getStudentDashboard(studentActor);

      expect(res.upcomingDeadlines[0].passed).toBe(false);
      expect(res.upcomingDeadlines[0].penaltyApplied).toBe(true);
      expect(res.recentScores[0].submittedAt).toBe(submittedDate.toISOString());
    });

    it('counts monthly extensions using VN month bounds across ALL statuses (not only APPROVED)', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-30T17:30:00.000Z')); // 2026-12-01 00:30 VN
      try {
        const expectedBounds = createVnMonthBounds(new Date());
        extensionModel.countDocuments.mockResolvedValue(2);

        const res = await service.getStudentDashboard(studentActor);

        expect(res.extensionsUsedThisMonth).toBe(2);
        const queryArg = extensionModel.countDocuments.mock.calls[0][0];
        expect(queryArg.status).toBeUndefined();
        expect(queryArg.createdAt.$gte).toEqual(expectedBounds.startOfMonth);
        expect(queryArg.createdAt.$lte ?? queryArg.createdAt.$lt).toBeDefined();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getStudentProfile', () => {
    it('counts monthly extensions using VN month bounds across ALL statuses', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-30T17:30:00.000Z'));
      try {
        const expectedBounds = createVnMonthBounds(new Date());
        extensionModel.countDocuments.mockResolvedValue(3);

        const res = await service.getStudentProfile(studentActor);

        expect(res.extensionsUsedThisMonth).toBe(3);
        const queryArg = extensionModel.countDocuments.mock.calls[0][0];
        expect(queryArg.status).toBeUndefined();
        expect(queryArg.createdAt.$gte).toEqual(expectedBounds.startOfMonth);
      } finally {
        jest.useRealTimers();
      }
    });
  });

  describe('getTeacherDashboard & getTeacherProfile', () => {
    it('returns zero counts and empty arrays without unscoped DB queries when teacher has 0 courses', async () => {
      courseModel.find.mockReturnValue(chain([]));

      const dash = await service.getTeacherDashboard(teacherActor);
      expect(dash.activeCoursesCount).toBe(0);
      expect(dash.pendingExtensionsCount).toBe(0);
      expect(dash.pendingTranslationsCount).toBe(0);
      expect(dash.overdueStudentsCount).toBe(0);
      expect(dash.recentAssignments).toEqual([]);
      expect(dash.upcomingLessons).toEqual([]);
      expect(extensionModel.countDocuments).not.toHaveBeenCalled();
      expect(translationModel.countDocuments).not.toHaveBeenCalled();
      expect(studentAssignmentModel.countDocuments).not.toHaveBeenCalled();
      expect(assignmentModel.find).not.toHaveBeenCalled();
      expect(lessonModel.find).not.toHaveBeenCalled();

      const prof = await service.getTeacherProfile(teacherActor);
      expect(prof.activeCoursesCount).toBe(0);
      expect(prof.pendingExtensionsCount).toBe(0);
      expect(prof.pendingTranslationsCount).toBe(0);
      expect(extensionModel.countDocuments).not.toHaveBeenCalled();
      expect(translationModel.countDocuments).not.toHaveBeenCalled();
    });

    it('scopes extensions, overdue students, and pending translations to teacher courses and tests', async () => {
      courseModel.find.mockReturnValue(chain([{ _id: courseId }]));
      assignmentModel.find.mockReturnValue(
        chain([
          {
            _id: assignmentId,
            courseId,
            exerciseId: new Types.ObjectId(),
            examTestId: testId,
            title: 'A1',
            openAt: new Date(),
            deadlineAt: new Date(Date.now() + 86400000),
          },
        ]),
      );
      examTestModel.find.mockReturnValue(chain([{ _id: testId }]));
      extensionModel.countDocuments.mockResolvedValue(4);
      studentAssignmentModel.countDocuments.mockResolvedValue(2);
      translationModel.countDocuments.mockResolvedValue(5);

      const dash = await service.getTeacherDashboard(teacherActor);
      expect(dash.pendingExtensionsCount).toBe(4);
      expect(dash.overdueStudentsCount).toBe(2);
      expect(dash.pendingTranslationsCount).toBe(5);

      expect(extensionModel.countDocuments).toHaveBeenCalledWith({
        courseId: { $in: [courseId] },
        status: ExtensionRequestStatus.PENDING,
      });
      expect(studentAssignmentModel.countDocuments).toHaveBeenCalledWith({
        assignmentId: { $in: [assignmentId] },
        status: StudentAssignmentStatus.OVERDUE,
      });
      const translationFilter = translationModel.countDocuments.mock.calls[0][0];
      expect(translationFilter.status).toBe(TranslationSubmissionStatus.SUBMITTED);
      expect(translationFilter.$or).toBeDefined();
      expect(JSON.stringify(translationFilter.$or)).toContain(assignmentId.toHexString());
      expect(JSON.stringify(translationFilter.$or)).toContain(testId.toHexString());

      extensionModel.countDocuments.mockClear();
      translationModel.countDocuments.mockClear();
      const prof = await service.getTeacherProfile(teacherActor);
      expect(prof.pendingExtensionsCount).toBe(4);
      expect(prof.pendingTranslationsCount).toBe(5);
      expect(extensionModel.countDocuments).toHaveBeenCalledWith({
        courseId: { $in: [courseId] },
        status: ExtensionRequestStatus.PENDING,
      });
    });
  });
});
