import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { Types } from 'mongoose';
import { EmailDelivery } from 'src/database/schemas/email-delivery.schema';
import { EmailDeliveryStatus } from 'src/database/schemas/enums';
import { MailService } from 'src/modules/mail/mail.service';
import { DeadlinesService } from 'src/modules/deadlines/deadlines.service';
import { EmailProcessor } from './processors/email.processor';
import { DeadlineProcessor } from './processors/deadline.processor';
import { DeadlineScheduler } from './schedulers/deadline.scheduler';
import { JOB_PROCESS_OVERDUE, JOB_SEND_EMAIL, QUEUE_DEADLINES, QUEUE_EMAIL } from './jobs.constants';

describe('JobsModule Processors & Scheduler', () => {
  let emailProcessor: EmailProcessor;
  let deadlineProcessor: DeadlineProcessor;
  let deadlineScheduler: DeadlineScheduler;

  let emailDeliveryModelMock: any;
  let mailServiceMock: any;
  let deadlinesServiceMock: any;
  let deadlineQueueMock: any;

  beforeEach(async () => {
    emailDeliveryModelMock = {
      findById: jest.fn(),
      find: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      }),
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
    };

    const emailQueueMock = {
      add: jest.fn().mockResolvedValue({ id: 'job-email-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        DeadlineProcessor,
        DeadlineScheduler,
        { provide: getModelToken(EmailDelivery.name), useValue: emailDeliveryModelMock },
        { provide: MailService, useValue: mailServiceMock },
        { provide: DeadlinesService, useValue: deadlinesServiceMock },
        { provide: getQueueToken(QUEUE_DEADLINES), useValue: deadlineQueueMock },
        { provide: getQueueToken(QUEUE_EMAIL), useValue: emailQueueMock },
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
});

