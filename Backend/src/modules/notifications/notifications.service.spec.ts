import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { getQueueToken } from '@nestjs/bullmq';
import { Types } from 'mongoose';
import { NotificationsService } from './notifications.service';
import { Notification } from 'src/database/schemas/notification.schema';
import { EmailDelivery } from 'src/database/schemas/email-delivery.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { NotificationType, UserRole, UserStatus } from 'src/database/schemas/enums';
import { QUEUE_EMAIL } from '../jobs/jobs.constants';

describe('NotificationsService', () => {
  let service: NotificationsService;
  let notificationModelMock: any;
  let emailDeliveryModelMock: any;
  let userModelMock: any;
  let emailQueueMock: any;

  const userId = new Types.ObjectId();
  const mockUser = {
    _id: userId,
    email: 'student@ielts.local',
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  beforeEach(async () => {
    function MockNotifInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.createdAt = new Date();
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    notificationModelMock = MockNotifInstance;
    notificationModelMock.find = jest.fn();
    notificationModelMock.findById = jest.fn();
    notificationModelMock.countDocuments = jest.fn();
    notificationModelMock.updateMany = jest.fn();

    function MockDeliveryInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    }
    emailDeliveryModelMock = MockDeliveryInstance;
    emailDeliveryModelMock.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    userModelMock = {
      findById: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({ email: 'student@ielts.local' }),
        }),
      }),
    };

    emailQueueMock = {
      add: jest.fn().mockResolvedValue({ id: 'mock-job-id' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationsService,
        { provide: getModelToken(Notification.name), useValue: notificationModelMock },
        { provide: getModelToken(EmailDelivery.name), useValue: emailDeliveryModelMock },
        { provide: getModelToken(User.name), useValue: userModelMock },
        { provide: getQueueToken(QUEUE_EMAIL), useValue: emailQueueMock },
      ],
    }).compile();

    service = module.get<NotificationsService>(NotificationsService);
  });

  it('creates an in-app notification and enqueues email delivery', async () => {
    const notif = await service.create({
      userId: userId.toHexString(),
      type: NotificationType.NEW_ASSIGNMENT,
      title: 'Bài tập mới: Reading Test 1',
      body: 'Bạn có bài tập mới cần hoàn thành.',
      sendEmail: true,
      emailTemplateKey: 'assignment-published',
    });

    expect(notif).toBeDefined();
    expect(notif.title).toContain('Reading Test 1');
    expect(emailQueueMock.add).toHaveBeenCalled();
  });

  it('finds user notifications with unread count', async () => {
    notificationModelMock.find.mockReturnValue({
      skip: jest.fn().mockReturnValue({
        limit: jest.fn().mockReturnValue({
          sort: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue([]),
          }),
        }),
      }),
    });

    notificationModelMock.countDocuments
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(5) }) // total
      .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(2) }); // unread

    const res = await service.findMyNotifications(mockUser, { page: 1, limit: 10 });
    expect(res.total).toBe(5);
    expect(res.unreadCount).toBe(2);
    expect(res.items).toEqual([]);
  });

  it('marks all notifications as read', async () => {
    notificationModelMock.updateMany.mockReturnValue({
      exec: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
    });

    const res = await service.markAllAsRead(mockUser);
    expect(res.modifiedCount).toBe(3);
  });
});

