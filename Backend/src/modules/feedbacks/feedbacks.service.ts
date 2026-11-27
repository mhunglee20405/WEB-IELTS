import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { createHash } from 'crypto';
import Redis from 'ioredis';
import { Model, Types } from 'mongoose';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { FeedbackCategory, FeedbackStatus, UserRole } from 'src/database/schemas/enums';
import { Feedback, FeedbackDocument } from 'src/database/schemas/feedback.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import {
  CreateFeedbackDto,
  FeedbackQueryDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';

const DAILY_FEEDBACK_LIMIT = 5;
const FEEDBACK_RATE_TTL_SECONDS = 24 * 60 * 60;
const FEEDBACK_DAILY_LIMIT_MESSAGE =
  'Bạn đã đạt giới hạn gửi góp ý trong ngày hôm nay (tối đa 5 lần).';

function extractObjectId(ref: unknown): string {
  if (!ref) return '';
  if (ref instanceof Types.ObjectId) return ref.toHexString();
  if (typeof ref === 'object' && ref !== null) {
    if (
      'toHexString' in ref &&
      typeof (ref as { toHexString?: unknown }).toHexString === 'function'
    ) {
      return (ref as { toHexString: () => string }).toHexString();
    }
    if ('_id' in ref) {
      return extractObjectId((ref as { _id: unknown })._id);
    }
  }
  return String(ref);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class FeedbacksService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FeedbacksService.name);
  private redisClient: Redis | null = null;
  private isRedisConnected = false;
  private readonly redisKeyPrefix: string;
  private readonly fallbackRateStore = new Map<
    string,
    { count: number; expiresAt: number }
  >();

  constructor(
    @InjectModel(Feedback.name)
    private readonly feedbackModel: Model<FeedbackDocument>,
    @Optional() private readonly auditService?: AuditService,
    @Optional() private readonly configService?: ConfigService,
    @Optional() @Inject('FEEDBACK_REDIS_CLIENT') private readonly injectedRedis?: Redis,
  ) {
    this.redisKeyPrefix =
      this.configService?.get<string>('redis.keyPrefix', 'ielts:customer:') ??
      'ielts:customer:';
    if (this.injectedRedis) {
      this.redisClient = this.injectedRedis;
      this.isRedisConnected = true;
    }
  }

  async onModuleInit() {
    if (this.injectedRedis) {
      this.redisClient = this.injectedRedis;
      this.isRedisConnected = true;
      return;
    }

    const host = this.configService?.get<string>('redis.host', 'localhost') ?? 'localhost';
    const port = this.configService?.get<number>('redis.port', 6379) ?? 6379;
    const password = this.configService?.get<string>('redis.password', '') || undefined;

    let client: Redis | null = null;
    try {
      client = new Redis({
        host,
        port,
        password,
        keyPrefix: this.redisKeyPrefix,
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        enableOfflineQueue: false,
        retryStrategy: () => null,
      });

      client.on('error', () => {
        this.isRedisConnected = false;
      });

      await client.connect();
      this.redisClient = client;
      this.isRedisConnected = true;
      this.logger.log('FeedbacksService: Redis connected for daily rate limit store');
    } catch (err: any) {
      if (client) {
        try {
          client.disconnect();
        } catch {
          // ignore cleanup errors
        }
      }
      this.isRedisConnected = false;
      this.logger.warn(
        `FeedbacksService: Redis unavailable (${err?.message || err}). Falling back to memory store.`,
      );
    }
  }

  async onModuleDestroy() {
    if (this.redisClient && !this.injectedRedis) {
      try {
        await this.redisClient.quit();
      } catch {
        // ignore on shutdown
      }
    }
  }

  /**
   * Submit an anonymous student feedback.
   * Enforces max 5 submissions per student per VN calendar day without storing any author PII.
   */
  async create(dto: CreateFeedbackDto, student: UserDocument) {
    if (student?.role && student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can submit feedback');
    }

    const studentId = extractObjectId(student?._id ?? (student as { id?: unknown })?.id);
    if (!studentId) {
      throw new BadRequestException('Invalid student identity');
    }

    await this.enforceDailyRateLimit(studentId);

    const payload: {
      category: FeedbackCategory;
      content: string;
      status: FeedbackStatus;
      rating?: number;
    } = {
      category: dto.category,
      content: dto.content.trim(),
      status: FeedbackStatus.NEW,
    };

    if (dto.rating !== undefined && dto.rating !== null) {
      payload.rating = dto.rating;
    }

    const doc = new this.feedbackModel(payload);
    const saved = await doc.save();
    const raw = typeof saved.toObject === 'function' ? saved.toObject() : saved;

    return {
      id: extractObjectId(raw._id),
      category: raw.category,
      rating: raw.rating ?? null,
      status: raw.status,
      createdAt: raw.createdAt,
    };
  }

  /**
   * List anonymous feedbacks with filters, pagination, and unread count (Admin only).
   */
  async findAll(query: FeedbackQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));
    const skip = (page - 1) * limit;

    const filter: Record<string, unknown> = {};
    if (query.status) {
      filter.status = query.status;
    }
    if (query.category) {
      filter.category = query.category;
    }
    const trimmedSearch = query.search?.trim();
    if (trimmedSearch) {
      filter.content = {
        $regex: escapeRegex(trimmedSearch),
        $options: 'i',
      };
    }

    const [docs, total, unreadCount] = await Promise.all([
      this.feedbackModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .exec(),
      this.feedbackModel.countDocuments(filter).exec(),
      this.feedbackModel.countDocuments({ status: FeedbackStatus.NEW }).exec(),
    ]);

    return {
      items: docs.map((doc) => this.formatFeedback(doc)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
      unreadCount,
    };
  }

  /**
   * Update feedback triage status & optional admin note, and record an audit log entry.
   */
  async updateStatus(
    id: string,
    dto: UpdateFeedbackStatusDto,
    admin: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('Invalid feedback ID');
    }

    const feedback = await this.feedbackModel.findById(id).exec();
    if (!feedback) {
      throw new NotFoundException('Feedback not found');
    }

    const adminId = extractObjectId(admin?._id ?? (admin as { id?: unknown })?.id);
    const reviewedBy = Types.ObjectId.isValid(adminId)
      ? new Types.ObjectId(adminId)
      : undefined;

    feedback.status = dto.status;
    if (dto.adminNote !== undefined) {
      const trimmedNote =
        typeof dto.adminNote === 'string' ? dto.adminNote.trim() : '';
      feedback.adminNote = trimmedNote || undefined;
    }
    feedback.reviewedBy = reviewedBy;
    feedback.reviewedAt = new Date();

    const saved = await feedback.save();

    await this.auditService?.log({
      action: 'FEEDBACK_STATUS_UPDATED',
      entityType: 'Feedback',
      entityId: saved._id as Types.ObjectId,
      actorId: reviewedBy,
      metadata: {
        status: dto.status,
      },
    });

    return this.formatFeedback(saved);
  }

  private async enforceDailyRateLimit(studentId: string): Promise<void> {
    const dateVn = formatVnDateTime(new Date()).slice(0, 10);
    const digest = createHash('sha256')
      .update(`${studentId}:${dateVn}`)
      .digest('hex');
    const rateKey = `feedback:rate:${digest}`;

    const count = await this.incrementRateCounter(rateKey);
    if (count > DAILY_FEEDBACK_LIMIT) {
      throw new HttpException(
        {
          code: 'FEEDBACK_DAILY_LIMIT_EXCEEDED',
          message: FEEDBACK_DAILY_LIMIT_MESSAGE,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async incrementRateCounter(rateKey: string): Promise<number> {
    if (this.isRedisConnected && this.redisClient) {
      try {
        const count = await this.redisClient.incr(rateKey);
        if (count === 1) {
          await this.redisClient.expire(rateKey, FEEDBACK_RATE_TTL_SECONDS);
        }
        return count;
      } catch (err: any) {
        this.logger.warn(
          `FeedbacksService: Redis rate increment failed, falling back to memory store: ${err?.message || err}`,
        );
      }
    }

    const nowMs = Date.now();
    if (this.fallbackRateStore.size > 1000) {
      for (const [key, entry] of this.fallbackRateStore.entries()) {
        if (entry.expiresAt <= nowMs) {
          this.fallbackRateStore.delete(key);
        }
      }
    }

    const existing = this.fallbackRateStore.get(rateKey);
    if (!existing || existing.expiresAt <= nowMs) {
      this.fallbackRateStore.set(rateKey, {
        count: 1,
        expiresAt: nowMs + FEEDBACK_RATE_TTL_SECONDS * 1000,
      });
      return 1;
    }

    existing.count += 1;
    return existing.count;
  }

  private formatFeedback(doc: FeedbackDocument) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    return {
      id: extractObjectId(raw._id),
      category: raw.category,
      rating: raw.rating ?? null,
      content: raw.content,
      status: raw.status,
      adminNote: raw.adminNote ?? null,
      reviewedAt: raw.reviewedAt ?? null,
      createdAt: raw.createdAt,
    };
  }
}
