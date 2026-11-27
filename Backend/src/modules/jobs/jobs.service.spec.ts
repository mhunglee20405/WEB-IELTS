import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { EmailDelivery } from 'src/database/schemas/email-delivery.schema';
import { Course } from 'src/database/schemas/course.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Notification } from 'src/database/schemas/notification.schema';
import {
  AssignmentStatus,
  CourseStatus,
  EmailDeliveryStatus,
  NotificationType,
} from 'src/database/schemas/enums';
import { MailService } from 'src/modules/mail/mail.service';
import { DeadlinesService } from 'src/modules/deadlines/deadlines.service';
import { NotificationsService } from 'src/modules/notifications/notifications.service';
import { EmailProcessor } from './processors/email.processor';
import { DeadlineProcessor } from './processors/deadline.processor';
import { AssignmentReminderProcessor } from './processors/assignment-reminder.processor';
import { DeadlineScheduler } from './schedulers/deadline.scheduler';
import { AssignmentReminderScheduler } from './schedulers/assignment-reminder.scheduler';
import { AssignmentReminderService } from './assignment-reminder.service';
import { JobsController } from './jobs.controller';
import {
  JOB_CHECK_TEACHER_SCHEDULE,
  JOB_PROCESS_OVERDUE,
  JOB_SEND_EMAIL,
  QUEUE_DEADLINES,
  QUEUE_EMAIL,
  QUEUE_REMINDERS,
} from './jobs.constants';

describe('JobsModule Processors & Scheduler', () => {
  let emailProcessor: EmailProcessor;
  let deadlineProcessor: DeadlineProcessor;
  let deadlineScheduler: DeadlineScheduler;
  let assignmentReminderService: AssignmentReminderService;
  let assignmentReminderScheduler: AssignmentReminderScheduler;
  let assignmentReminderProcessor: AssignmentReminderProcessor;
  let jobsController: JobsController;

  let emailDeliveryModelMock: any;
  let courseModelMock: any;
  let assignmentModelMock: any;
  let notificationModelMock: any;
  let notificationsServiceMock: any;
  let mailServiceMock: any;
  let deadlinesServiceMock: any;
  let deadlineQueueMock: any;
  let emailQueueMock: any;
  let reminderQueueMock: any;

  beforeEach(async () => {
    emailDeliveryModelMock = {
      findById: jest.fn(),
      find: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
    };

    courseModelMock = {
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    assignmentModelMock = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    notificationModelMock = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    notificationsServiceMock = {
      create: jest.fn().mockResolvedValue({ _id: new Types.ObjectId() }),
    };

    mailServiceMock = {
      renderTemplate: jest.fn().mockReturnValue({
        subject: 'Rendered Subject',
        html: '<p>Rendered HTML</p>',
        text: 'Rendered Text',
      }),
      sendMail: jest.fn().mockResolvedValue({ messageId: 'msg-12345' }),
    };

    deadlinesServiceMock = {
      processOverdueAssignments: jest.fn().mockResolvedValue({
        processedCount: 2,
        newPenaltiesCount: 1,
      }),
    };

    deadlineQueueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-repeatable-1' }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    };

    emailQueueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-email-1' }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    };

    reminderQueueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-reminder-1' }),
      getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [JobsController],
      providers: [
        EmailProcessor,
        DeadlineProcessor,
        AssignmentReminderProcessor,
        DeadlineScheduler,
        AssignmentReminderScheduler,
        AssignmentReminderService,
        { provide: getModelToken(EmailDelivery.name), useValue: emailDeliveryModelMock },
        { provide: getModelToken(Course.name), useValue: courseModelMock },
        { provide: getModelToken(Assignment.name), useValue: assignmentModelMock },
        { provide: getModelToken(Notification.name), useValue: notificationModelMock },
        { provide: NotificationsService, useValue: notificationsServiceMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: DeadlinesService, useValue: deadlinesServiceMock },
        { provide: getQueueToken(QUEUE_DEADLINES), useValue: deadlineQueueMock },
        { provide: getQueueToken(QUEUE_EMAIL), useValue: emailQueueMock },
        { provide: getQueueToken(QUEUE_REMINDERS), useValue: reminderQueueMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              if (key === 'nodeEnv') return 'test';
              return null;
            }),
          },
        },
      ],
    }).compile();

    emailProcessor = module.get<EmailProcessor>(EmailProcessor);
    deadlineProcessor = module.get<DeadlineProcessor>(DeadlineProcessor);
    deadlineScheduler = module.get<DeadlineScheduler>(DeadlineScheduler);
    assignmentReminderService = module.get<AssignmentReminderService>(AssignmentReminderService);
    assignmentReminderScheduler = module.get<AssignmentReminderScheduler>(AssignmentReminderScheduler);
    assignmentReminderProcessor = module.get<AssignmentReminderProcessor>(AssignmentReminderProcessor);
    jobsController = module.get<JobsController>(JobsController);
  });

  describe('EmailProcessor', () => {
    it('processes queued email delivery and marks status as SENT', async () => {
      const mockDeliveryDoc: any = {
        _id: new Types.ObjectId(),
        recipientEmail: 'student@ielts.local',
        templateKey: 'assignment-published',
        payload: { title: 'Test 1' },
        status: EmailDeliveryStatus.QUEUED,
        save: jest.fn().mockResolvedValue(true),
      };

      emailDeliveryModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDeliveryDoc),
      });

      const mockJob = {
        name: JOB_SEND_EMAIL,
        id: 'job-1',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { deliveryId: mockDeliveryDoc._id.toHexString() },
      } as unknown as Job;

      const res = await emailProcessor.process(mockJob);

      expect(res.success).toBe(true);
      expect(mailServiceMock.sendMail).toHaveBeenCalled();
      expect(mockDeliveryDoc.status).toBe(EmailDeliveryStatus.SENT);
      expect(mockDeliveryDoc.providerMessageId).toBe('msg-12345');
      expect(mockDeliveryDoc.save).toHaveBeenCalled();
    });

    it('skips already sent email to preserve delivery idempotency', async () => {
      const mockDeliveryDoc: any = {
        _id: new Types.ObjectId(),
        recipientEmail: 'student@ielts.local',
        status: EmailDeliveryStatus.SENT,
        save: jest.fn(),
      };

      emailDeliveryModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(mockDeliveryDoc),
      });

      const mockJob = {
        name: JOB_SEND_EMAIL,
        id: 'job-2',
        attemptsMade: 0,
        opts: { attempts: 3 },
        data: { deliveryId: mockDeliveryDoc._id.toHexString() },
      } as unknown as Job;

      const res = await emailProcessor.process(mockJob);
      expect(res.skipped).toBe(true);
      expect(mailServiceMock.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('DeadlineProcessor', () => {
    it('executes scheduled overdue processor and logs metrics', async () => {
      const mockJob = {
        name: JOB_PROCESS_OVERDUE,
        id: 'job-dl-1',
      } as unknown as Job;

      const res = await deadlineProcessor.process(mockJob);
      expect(res.processedCount).toBe(2);
      expect(res.newPenaltiesCount).toBe(1);
      expect(deadlinesServiceMock.processOverdueAssignments).toHaveBeenCalled();
    });
  });

  describe('DeadlineScheduler', () => {
    it('triggers manual overdue check job', async () => {
      const job = await deadlineScheduler.triggerNow();
      expect(job).toBeDefined();
      expect(deadlineQueueMock.add).toHaveBeenCalledWith(
        JOB_PROCESS_OVERDUE,
        expect.objectContaining({ triggeredAt: expect.any(String) }),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });
  });

  describe('AssignmentReminderService', () => {
    it('computes ISO week accurately in Asia/Ho_Chi_Minh including UTC/VN midnight boundaries', () => {
      // 2026-11-27 08:00:00+07:00 -> Friday W48
      expect(assignmentReminderService.getVnIsoWeek(new Date('2026-11-27T01:00:00.000Z'))).toBe('2026-W48');

      // 2026-11-22 17:00:00Z == 2026-11-23 00:00:00+07:00 (Monday W48 in VN, Sunday W47 in UTC)
      expect(assignmentReminderService.getVnIsoWeek(new Date('2026-11-22T17:00:00.000Z'))).toBe('2026-W48');

      // 2026-11-22 16:59:59.999Z == 2026-11-22 23:59:59.999+07:00 (Sunday W47 in VN)
      expect(assignmentReminderService.getVnIsoWeek(new Date('2026-11-22T16:59:59.999Z'))).toBe('2026-W47');

      // ISO year-boundary edge cases
      // Mon Dec 29, 2025 VN -> 2026-W01
      expect(assignmentReminderService.getVnIsoWeek(new Date('2025-12-29T01:00:00.000Z'))).toBe('2026-W01');
      // Fri Jan 1, 2021 VN -> 2020-W53
      expect(assignmentReminderService.getVnIsoWeek(new Date('2021-01-01T01:00:00.000Z'))).toBe('2020-W53');
    });

    it('sends 1 ASSIGNMENT_SCHEDULE_REMINDER notification when active course has 0 scheduled assignments in next 7 days', async () => {
      const teacherId = new Types.ObjectId();
      const courseId = new Types.ObjectId();
      const now = new Date('2026-11-27T01:00:00.000Z'); // 2026-11-27 08:00+07:00 (2026-W48)

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: courseId,
            code: 'IELTS-75',
            title: 'IELTS Intensive 7.5',
            teacherId,
            status: CourseStatus.ACTIVE,
          },
        ]),
      });

      assignmentModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      notificationModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await assignmentReminderService.checkAndRemindTeachers(now);

      expect(res).toEqual({
        checkedCourses: 1,
        remindedCount: 1,
        skippedAlreadyReminded: 0,
        isoWeek: '2026-W48',
      });

      expect(courseModelMock.find).toHaveBeenCalledWith({
        status: CourseStatus.ACTIVE,
        $or: [{ endAt: { $exists: false } }, { endAt: null }, { endAt: { $gt: now } }],
      });

      // Next 7 VN days: 2026-11-28 00:00:00+07:00 .. 2026-12-04 23:59:59.999+07:00
      expect(assignmentModelMock.findOne).toHaveBeenCalledWith({
        courseId,
        status: {
          $in: [
            AssignmentStatus.PUBLISHED,
            AssignmentStatus.SCHEDULED,
            AssignmentStatus.AVAILABLE,
          ],
        },
        openAt: {
          $gte: new Date('2026-11-27T17:00:00.000Z'),
          $lte: new Date('2026-12-04T16:59:59.999Z'),
        },
      });

      expect(notificationsServiceMock.create).toHaveBeenCalledTimes(1);
      expect(notificationsServiceMock.create).toHaveBeenCalledWith({
        userId: teacherId.toHexString(),
        type: NotificationType.ASSIGNMENT_SCHEDULE_REMINDER,
        title: 'Nhắc lên lịch giao bài tuần tới: IELTS Intensive 7.5',
        body: 'Khóa học IELTS-75 (IELTS Intensive 7.5) chưa có bài tập nào được lên lịch trong 7 ngày tới (2026-11-28 – 2026-12-04). Vui lòng lên lịch giao bài trước 1 tuần.',
        payload: {
          courseId: courseId.toHexString(),
          courseTitle: 'IELTS Intensive 7.5',
          courseCode: 'IELTS-75',
          isoWeek: '2026-W48',
          windowStartVn: '2026-11-28',
          windowEndVn: '2026-12-04',
        },
        sendEmail: true,
        emailTemplateKey: 'assignment-schedule-reminder',
        idempotencyKey: `notif:schedule-reminder:${teacherId.toHexString()}:${courseId.toHexString()}:2026-W48`,
      });
    });

    it('does NOT remind when active course already has a SCHEDULED/PUBLISHED/AVAILABLE assignment in next 7 days', async () => {
      const teacherId = new Types.ObjectId();
      const courseId = new Types.ObjectId();
      const now = new Date('2026-11-27T01:00:00.000Z');

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: courseId,
            code: 'IELTS-65',
            title: 'IELTS Foundation 6.5',
            teacherId,
            status: CourseStatus.ACTIVE,
          },
        ]),
      });

      assignmentModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          status: AssignmentStatus.SCHEDULED,
        }),
      });

      const res = await assignmentReminderService.checkAndRemindTeachers(now);

      expect(res).toEqual({
        checkedCourses: 1,
        remindedCount: 0,
        skippedAlreadyReminded: 0,
        isoWeek: '2026-W48',
      });
      expect(notificationsServiceMock.create).not.toHaveBeenCalled();
    });

    it('skips already-reminded course when run twice in the same ISO week (idempotency)', async () => {
      const teacherId = new Types.ObjectId();
      const courseId = new Types.ObjectId();
      const now = new Date('2026-11-27T01:00:00.000Z');
      const storedKeys = new Set<string>();

      courseModelMock.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          {
            _id: courseId,
            code: 'IELTS-80',
            title: 'IELTS Mastery 8.0',
            teacherId,
            status: CourseStatus.ACTIVE,
          },
        ]),
      });

      assignmentModelMock.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      notificationModelMock.findOne.mockImplementation(({ idempotencyKey }: { idempotencyKey: string }) => ({
        exec: jest.fn().mockResolvedValue(
          storedKeys.has(idempotencyKey) ? { _id: new Types.ObjectId(), idempotencyKey } : null,
        ),
      }));

      notificationsServiceMock.create.mockImplementation(async (dto: any) => {
        if (dto.idempotencyKey) {
          storedKeys.add(dto.idempotencyKey);
        }
        return { _id: new Types.ObjectId(), ...dto };
      });

      const firstRun = await assignmentReminderService.checkAndRemindTeachers(now);
      expect(firstRun).toEqual({
        checkedCourses: 1,
        remindedCount: 1,
        skippedAlreadyReminded: 0,
        isoWeek: '2026-W48',
      });

      const secondRun = await assignmentReminderService.checkAndRemindTeachers(
        new Date('2026-11-28T01:00:00.000Z'), // Still 2026-W48
      );
      expect(secondRun).toEqual({
        checkedCourses: 1,
        remindedCount: 0,
        skippedAlreadyReminded: 1,
        isoWeek: '2026-W48',
      });
      expect(notificationsServiceMock.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('AssignmentReminderProcessor', () => {
    it('executes teacher assignment schedule reminder check on JOB_CHECK_TEACHER_SCHEDULE', async () => {
      const checkSpy = jest
        .spyOn(assignmentReminderService, 'checkAndRemindTeachers')
        .mockResolvedValue({
          checkedCourses: 4,
          remindedCount: 2,
          skippedAlreadyReminded: 1,
          isoWeek: '2026-W48',
        });

      const mockJob = {
        name: JOB_CHECK_TEACHER_SCHEDULE,
        id: 'job-rem-1',
      } as unknown as Job;

      const res = await assignmentReminderProcessor.process(mockJob);
      expect(checkSpy).toHaveBeenCalled();
      expect(res).toEqual({
        checkedCourses: 4,
        remindedCount: 2,
        skippedAlreadyReminded: 1,
        isoWeek: '2026-W48',
      });
    });
  });

  describe('AssignmentReminderScheduler', () => {
    it('registers daily 08:00 Asia/Ho_Chi_Minh cron job in non-test environments', async () => {
      const prodConfigMock = {
        get: jest.fn((key: string) => (key === 'nodeEnv' ? 'production' : null)),
      } as unknown as ConfigService;

      const scheduler = new AssignmentReminderScheduler(reminderQueueMock, prodConfigMock);
      await scheduler.onModuleInit();

      expect(reminderQueueMock.add).toHaveBeenCalledWith(
        JOB_CHECK_TEACHER_SCHEDULE,
        {},
        expect.objectContaining({
          repeat: {
            pattern: '0 8 * * *',
            tz: 'Asia/Ho_Chi_Minh',
          },
          jobId: 'teacher-assignment-schedule-reminder',
        }),
      );
    });

    it('triggers manual schedule reminder job', async () => {
      const job = await assignmentReminderScheduler.triggerNow();
      expect(job).toBeDefined();
      expect(reminderQueueMock.add).toHaveBeenCalledWith(
        JOB_CHECK_TEACHER_SCHEDULE,
        expect.objectContaining({ triggeredAt: expect.any(String) }),
        expect.objectContaining({ removeOnComplete: true }),
      );
    });
  });

  describe('JobsController', () => {
    it('triggers immediate schedule reminder check via POST /jobs/reminders/trigger', async () => {
      const summary = {
        checkedCourses: 3,
        remindedCount: 1,
        skippedAlreadyReminded: 1,
        isoWeek: '2026-W48',
      };
      jest
        .spyOn(assignmentReminderService, 'checkAndRemindTeachers')
        .mockResolvedValue(summary);

      const res = await jobsController.triggerScheduleReminders();
      expect(res).toEqual(summary);
    });

    it('includes reminderQueue in getQueueMetrics()', async () => {
      const metrics = await jobsController.getQueueMetrics();
      expect(metrics).toEqual({
        emailQueue: { waiting: 0, active: 0 },
        deadlineQueue: { waiting: 0, active: 0 },
        reminderQueue: { waiting: 0, active: 0 },
      });
    });
  });
});

