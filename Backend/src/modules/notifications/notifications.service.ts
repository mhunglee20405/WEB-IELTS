import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Model, Types } from 'mongoose';
import {
  Notification,
  NotificationDocument,
} from 'src/database/schemas/notification.schema';
import {
  EmailDelivery,
  EmailDeliveryDocument,
} from 'src/database/schemas/email-delivery.schema';
import { User, UserDocument } from 'src/database/schemas/user.schema';
import { EmailDeliveryStatus } from 'src/database/schemas/enums';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { JOB_SEND_EMAIL, QUEUE_EMAIL } from '../jobs/jobs.constants';
import { CreateNotificationDto } from './dto/create-notification.dto';
import { NotificationQueryDto } from './dto/notification-query.dto';

function extractObjectId(ref: any): string {
  if (!ref) return '';
  if (ref instanceof Types.ObjectId) return ref.toHexString();
  if (typeof ref === 'object' && ref._id) {
    const id = ref._id;
    return id instanceof Types.ObjectId ? id.toHexString() : String(id);
  }
  return String(ref);
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name)
    private notificationModel: Model<NotificationDocument>,
    @InjectModel(EmailDelivery.name)
    private emailDeliveryModel: Model<EmailDeliveryDocument>,
    @InjectModel(User.name)
    private userModel: Model<UserDocument>,
    @InjectQueue(QUEUE_EMAIL)
    private emailQueue: Queue,
  ) {}

  /**
   * Create an in-app notification and optionally enqueue an asynchronous email
   */
  async create(dto: CreateNotificationDto): Promise<NotificationDocument> {
    if (!Types.ObjectId.isValid(dto.userId)) {
      throw new BadRequestException('Invalid userId');
    }

    const notifDoc = new this.notificationModel({
      userId: new Types.ObjectId(dto.userId),
      type: dto.type,
      title: dto.title,
      body: dto.body,
      payload: dto.payload,
      isRead: false,
    });

    const savedNotif = await notifDoc.save();

    // Optionally enqueue email delivery
    if (dto.sendEmail) {
      try {
        const user = await this.userModel.findById(dto.userId).select('email').exec();
        if (user && user.email) {
          const templateKey = dto.emailTemplateKey || 'general-notification';
          const idempotencyKey = `email-${savedNotif._id}`;

          // Check if email delivery already exists
          let delivery = await this.emailDeliveryModel.findOne({ idempotencyKey }).exec();
          if (!delivery) {
            delivery = new this.emailDeliveryModel({
              notificationId: savedNotif._id,
              recipientEmail: user.email,
              templateKey,
              payload: { ...dto.payload, title: dto.title, body: dto.body },
              status: EmailDeliveryStatus.QUEUED,
              idempotencyKey,
            });
            await delivery.save();
          }

          // Enqueue BullMQ job with deterministic jobId to prevent duplicate worker jobs
          await this.emailQueue.add(
            JOB_SEND_EMAIL,
            { deliveryId: delivery._id.toString() },
            {
              jobId: idempotencyKey,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            },
          );
        }
      } catch (err: any) {
        this.logger.error(`Failed to enqueue email for notification ${savedNotif._id}: ${err.message}`);
      }
    }

    return savedNotif;
  }

  /**
   * List notifications for authenticated user
   */
  async findMyNotifications(user: UserDocument, query: NotificationQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = { userId: user._id };
    if (typeof query.isRead === 'boolean') {
      filter.isRead = query.isRead;
    }
    if (query.type) {
      filter.type = query.type;
    }

    const [docs, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
      this.notificationModel.countDocuments({ userId: user._id, isRead: false }).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatNotification(d)),
      total,
      unreadCount,
      page,
      limit,
    };
  }

  /**
   * Get total unread count for user
   */
  async getUnreadCount(user: UserDocument) {
    const unreadCount = await this.notificationModel
      .countDocuments({ userId: user._id, isRead: false })
      .exec();

    return { unreadCount };
  }

  /**
   * Mark single notification as read
   */
  async markAsRead(id: string, user: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Notification not found');
    }

    const notif = await this.notificationModel.findById(id).exec();
    if (!notif) {
      throw new NotFoundException('Notification not found');
    }

    if (extractObjectId(notif.userId) !== extractObjectId(user._id)) {
      throw new ForbiddenException('You cannot modify another user’s notification');
    }

    notif.isRead = true;
    notif.readAt = new Date();
    await notif.save();

    return this.formatNotification(notif);
  }

  /**
   * Mark all unread notifications as read
   */
  async markAllAsRead(user: UserDocument) {
    const result = await this.notificationModel
      .updateMany(
        { userId: user._id, isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      )
      .exec();

    return {
      modifiedCount: result.modifiedCount,
    };
  }

  private formatNotification(doc: NotificationDocument) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      id: extractObjectId(raw._id),
      userId: extractObjectId(raw.userId),
      type: raw.type,
      title: raw.title,
      body: raw.body,
      payload: raw.payload,
      isRead: raw.isRead,
      readAt: raw.readAt,
      createdAt: raw.createdAt,
      createdAtVn: raw.createdAt ? formatVnDateTime(raw.createdAt) : undefined,
    };
  }
}
