import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { createHash } from 'crypto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { FeedbacksService } from './feedbacks.service';
import {
  CreateFeedbackDto,
  FeedbackQueryDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';
import { Feedback } from 'src/database/schemas/feedback.schema';
import {
  FeedbackCategory,
  FeedbackStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { AuditService } from '../audit/audit.service';

describe('FeedbacksService', () => {
  let service: FeedbacksService;
  let feedbackModelMock: any;
  let auditServiceMock: { log: jest.Mock };
  let persistedPayloads: Record<string, any>[];

  const makeStudent = (id?: string) =>
    ({
      _id: new Types.ObjectId(id || '507f1f77bcf86cd799439011'),
      role: UserRole.STUDENT,
      email: 'student@example.com',
      fullName: 'Nguyen Van A',
    }) as any;

  const makeAdmin = (id?: string) =>
    ({
      _id: new Types.ObjectId(id || '507f1f77bcf86cd799439099'),
      role: UserRole.ADMIN,
      email: 'admin@example.com',
      fullName: 'Admin User',
    }) as any;

  beforeEach(async () => {
    persistedPayloads = [];

    function MockFeedbackDoc(dto: Record<string, any>) {
      persistedPayloads.push({ ...dto });
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.status = dto.status ?? FeedbackStatus.NEW;
      this.createdAt = new Date('2026-11-27T07:00:00.000Z');
      this.updatedAt = new Date('2026-11-27T07:00:00.000Z');
      this.save = jest.fn().mockImplementation(async () => this);
      this.toObject = jest.fn().mockImplementation(() => {
        const plain: Record<string, any> = {};
        for (const [k, v] of Object.entries(this)) {
          if (typeof v !== 'function') plain[k] = v;
        }
        return plain;
      });
    }

    feedbackModelMock = MockFeedbackDoc;
    feedbackModelMock.find = jest.fn();
    feedbackModelMock.findById = jest.fn();
    feedbackModelMock.countDocuments = jest.fn();

    auditServiceMock = {
      log: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FeedbacksService,
        { provide: getModelToken(Feedback.name), useValue: feedbackModelMock },
        { provide: AuditService, useValue: auditServiceMock },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: any) => fallback),
          },
        },
      ],
    }).compile();

    service = module.get<FeedbacksService>(FeedbacksService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('create', () => {
    it('persists anonymous feedback with status NEW and zero author PII in DB doc or response', async () => {
      const student = makeStudent();
      const result = await service.create(
        {
          category: FeedbackCategory.SYSTEM_BUG,
          rating: 4,
          content: '  Giao diện làm bài bị giật khi chuyển đoạn.  ',
        },
        student,
      );

      expect(persistedPayloads).toHaveLength(1);
      const savedInput = persistedPayloads[0];
      expect(savedInput).toEqual({
        category: FeedbackCategory.SYSTEM_BUG,
        rating: 4,
        content: 'Giao diện làm bài bị giật khi chuyển đoạn.',
        status: FeedbackStatus.NEW,
      });

      for (const forbidden of [
        'studentId',
        'email',
        'fullName',
        'ipAddress',
        'userAgent',
      ]) {
        expect(savedInput[forbidden]).toBeUndefined();
        expect((result as Record<string, unknown>)[forbidden]).toBeUndefined();
      }

      expect(result).toEqual({
        id: expect.any(String),
        category: FeedbackCategory.SYSTEM_BUG,
        rating: 4,
        status: FeedbackStatus.NEW,
        createdAt: expect.any(Date),
      });
    });

    it('supports optional rating (null in formatted response, omitted on DB doc)', async () => {
      const student = makeStudent();
      const result = await service.create(
        {
          category: FeedbackCategory.OTHER,
          content: 'Mong có thêm bộ đề luyện tập Listening mỗi tuần.',
        },
        student,
      );

      expect(persistedPayloads[0].rating).toBeUndefined();
      expect(result.rating).toBeNull();
    });

    it('rejects non-student callers if invoked with non-student role', async () => {
      const admin = makeAdmin();
      await expect(
        service.create(
          {
            category: FeedbackCategory.CONTENT,
            content: 'Nội dung góp ý dài hơn mười ký tự.',
          },
          admin,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows 5 submissions in one VN calendar day and throws 429 FEEDBACK_DAILY_LIMIT_EXCEEDED on the 6th', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-27T07:00:00.000Z'));
      const student = makeStudent();

      for (let i = 1; i <= 5; i++) {
        const res = await service.create(
          {
            category: FeedbackCategory.TEACHING,
            rating: 5,
            content: `Góp ý hợp lệ số ${i} trong cùng một ngày VN.`,
          },
          student,
        );
        expect(res.status).toBe(FeedbackStatus.NEW);
      }

      expect(persistedPayloads).toHaveLength(5);

      let caught: unknown;
      try {
        await service.create(
          {
            category: FeedbackCategory.TEACHING,
            rating: 5,
            content: 'Góp ý thứ 6 trong ngày phải bị chặn rate limit.',
          },
          student,
        );
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(HttpException);
      const httpErr = caught as HttpException;
      expect(httpErr.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
      expect(httpErr.getResponse()).toEqual({
        code: 'FEEDBACK_DAILY_LIMIT_EXCEEDED',
        message: 'Bạn đã đạt giới hạn gửi góp ý trong ngày hôm nay (tối đa 5 lần).',
      });
      expect(persistedPayloads).toHaveLength(5);
    });

    it('resets daily quota at Asia/Ho_Chi_Minh midnight (17:00 UTC) and isolates quotas across students', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-27T16:59:50.000Z')); // 23:59:50 VN on 2026-11-27
      const studentA = makeStudent('507f1f77bcf86cd799439011');
      const studentB = makeStudent('507f1f77bcf86cd799439012');

      for (let i = 0; i < 5; i++) {
        await service.create(
          {
            category: FeedbackCategory.CONTENT,
            content: `Góp ý ngày 27 số ${i + 1} của học viên A.`,
          },
          studentA,
        );
      }

      // Student B still has full quota on the same VN day
      await expect(
        service.create(
          {
            category: FeedbackCategory.CONTENT,
            content: 'Góp ý đầu tiên của học viên B vẫn được phép.',
          },
          studentB,
        ),
      ).resolves.toMatchObject({ status: FeedbackStatus.NEW });

      // Crosses 00:00:00 VN (17:00:00 UTC) -> new VN day 2026-11-28
      jest.setSystemTime(new Date('2026-11-27T17:00:01.000Z'));

      await expect(
        service.create(
          {
            category: FeedbackCategory.CONTENT,
            content: 'Sang ngày VN mới học viên A có thể gửi góp ý lại.',
          },
          studentA,
        ),
      ).resolves.toMatchObject({ status: FeedbackStatus.NEW });
    });

    it('uses hashed Redis key feedback:rate:<sha256(studentId:dateVn)> with 24h TTL and falls back on Redis error', async () => {
      jest.useFakeTimers().setSystemTime(new Date('2026-11-27T07:00:00.000Z')); // 2026-11-27 VN
      const student = makeStudent('507f1f77bcf86cd799439011');
      const expectedHash = createHash('sha256')
        .update('507f1f77bcf86cd799439011:2026-11-27')
        .digest('hex');
      const expectedKey = `feedback:rate:${expectedHash}`;

      const mockRedis = {
        incr: jest
          .fn()
          .mockResolvedValueOnce(1)
          .mockResolvedValueOnce(6)
          .mockRejectedValueOnce(new Error('Redis connection lost')),
        expire: jest.fn().mockResolvedValue(1),
        on: jest.fn(),
        quit: jest.fn(),
      };

      const redisModule: TestingModule = await Test.createTestingModule({
        providers: [
          FeedbacksService,
          { provide: getModelToken(Feedback.name), useValue: feedbackModelMock },
          { provide: AuditService, useValue: auditServiceMock },
          {
            provide: ConfigService,
            useValue: {
              get: jest.fn((_key: string, fallback?: any) => fallback),
            },
          },
          { provide: 'FEEDBACK_REDIS_CLIENT', useValue: mockRedis },
        ],
      }).compile();

      const redisService = redisModule.get<FeedbacksService>(FeedbacksService);
      await redisService.onModuleInit();

      // 1st call -> incr = 1 -> sets 24h TTL
      await redisService.create(
        {
          category: FeedbackCategory.FEATURE_REQUEST,
          content: 'Thêm chế độ ôn tập từ vựng theo chủ đề.',
        },
        student,
      );
      expect(mockRedis.incr).toHaveBeenCalledWith(expectedKey);
      expect(expectedKey).not.toContain('507f1f77bcf86cd799439011');
      expect(mockRedis.expire).toHaveBeenCalledWith(expectedKey, 86400);

      // 2nd call -> incr = 6 -> throws 429
      await expect(
        redisService.create(
          {
            category: FeedbackCategory.FEATURE_REQUEST,
            content: 'Yêu cầu thứ 6 bị chặn từ Redis counter.',
          },
          student,
        ),
      ).rejects.toThrow(HttpException);

      // 3rd call -> Redis errors -> falls back cleanly to in-memory map
      await expect(
        redisService.create(
          {
            category: FeedbackCategory.FEATURE_REQUEST,
            content: 'Fallback sang bộ nhớ khi Redis gặp sự cố.',
          },
          student,
        ),
      ).resolves.toMatchObject({ status: FeedbackStatus.NEW });
    });
  });

  describe('findAll', () => {
    it('applies status, category, regex-escaped search, pagination, and returns unreadCount without author PII', async () => {
      const createdAt = new Date('2026-11-27T07:00:00.000Z');
      const docId = new Types.ObjectId();
      const mockDoc = {
        _id: docId,
        category: FeedbackCategory.SYSTEM_BUG,
        rating: 3,
        content: 'Lỗi hiển thị câu hỏi [Reading] (v1.0)?',
        status: FeedbackStatus.NEW,
        reviewedBy: new Types.ObjectId(),
        createdAt,
        toObject: () => ({
          _id: docId,
          category: FeedbackCategory.SYSTEM_BUG,
          rating: 3,
          content: 'Lỗi hiển thị câu hỏi [Reading] (v1.0)?',
          status: FeedbackStatus.NEW,
          reviewedBy: new Types.ObjectId(),
          createdAt,
        }),
      };

      const limitMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([mockDoc]),
      });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      feedbackModelMock.find.mockReturnValue({ sort: sortMock });

      feedbackModelMock.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(21) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(7) });

      const result = await service.findAll({
        page: 2,
        limit: 10,
        status: FeedbackStatus.NEW,
        category: FeedbackCategory.SYSTEM_BUG,
        search: '  [Reading] (v1.0)?.*+$^|\\  ',
      });

      expect(feedbackModelMock.find).toHaveBeenCalledWith({
        status: FeedbackStatus.NEW,
        category: FeedbackCategory.SYSTEM_BUG,
        content: {
          $regex: '\\[Reading\\] \\(v1\\.0\\)\\?\\.\\*\\+\\$\\^\\|\\\\',
          $options: 'i',
        },
      });
      expect(sortMock).toHaveBeenCalledWith({ createdAt: -1 });
      expect(skipMock).toHaveBeenCalledWith(10);
      expect(limitMock).toHaveBeenCalledWith(10);

      expect(feedbackModelMock.countDocuments).toHaveBeenNthCalledWith(1, {
        status: FeedbackStatus.NEW,
        category: FeedbackCategory.SYSTEM_BUG,
        content: {
          $regex: '\\[Reading\\] \\(v1\\.0\\)\\?\\.\\*\\+\\$\\^\\|\\\\',
          $options: 'i',
        },
      });
      expect(feedbackModelMock.countDocuments).toHaveBeenNthCalledWith(2, {
        status: FeedbackStatus.NEW,
      });

      expect(result).toEqual({
        items: [
          {
            id: docId.toHexString(),
            category: FeedbackCategory.SYSTEM_BUG,
            rating: 3,
            content: 'Lỗi hiển thị câu hỏi [Reading] (v1.0)?',
            status: FeedbackStatus.NEW,
            adminNote: null,
            reviewedAt: null,
            createdAt,
          },
        ],
        total: 21,
        page: 2,
        limit: 10,
        totalPages: 3,
        unreadCount: 7,
      });
      expect((result.items[0] as Record<string, unknown>).studentId).toBeUndefined();
      expect((result.items[0] as Record<string, unknown>).reviewedBy).toBeUndefined();
    });

    it('defaults page=1, limit=20, totalPages=1 when query is empty and total is 0', async () => {
      const limitMock = jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      });
      const skipMock = jest.fn().mockReturnValue({ limit: limitMock });
      const sortMock = jest.fn().mockReturnValue({ skip: skipMock });
      feedbackModelMock.find.mockReturnValue({ sort: sortMock });

      feedbackModelMock.countDocuments
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(0) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(0) });

      const result = await service.findAll({});

      expect(feedbackModelMock.find).toHaveBeenCalledWith({});
      expect(skipMock).toHaveBeenCalledWith(0);
      expect(limitMock).toHaveBeenCalledWith(20);
      expect(result).toEqual({
        items: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 1,
        unreadCount: 0,
      });
    });
  });

  describe('updateStatus', () => {
    it('throws BadRequestException when id is not a valid ObjectId', async () => {
      await expect(
        service.updateStatus(
          'not-an-object-id',
          { status: FeedbackStatus.REVIEWED },
          makeAdmin(),
        ),
      ).rejects.toThrow(BadRequestException);
      expect(feedbackModelMock.findById).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when feedback document does not exist', async () => {
      const missingId = new Types.ObjectId().toHexString();
      feedbackModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.updateStatus(
          missingId,
          { status: FeedbackStatus.REVIEWED },
          makeAdmin(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('updates status, adminNote, reviewedBy, reviewedAt, writes AuditLog, and returns formatted item', async () => {
      const docId = new Types.ObjectId();
      const admin = makeAdmin('507f1f77bcf86cd799439099');
      const createdAt = new Date('2026-11-27T06:00:00.000Z');
      const existingDoc: any = {
        _id: docId,
        category: FeedbackCategory.CONTENT,
        rating: 4,
        content: 'Cần bổ sung giải thích đáp án chi tiết hơn.',
        status: FeedbackStatus.NEW,
        createdAt,
        save: jest.fn().mockImplementation(async () => existingDoc),
        toObject: () => ({
          _id: existingDoc._id,
          category: existingDoc.category,
          rating: existingDoc.rating,
          content: existingDoc.content,
          status: existingDoc.status,
          adminNote: existingDoc.adminNote,
          reviewedBy: existingDoc.reviewedBy,
          reviewedAt: existingDoc.reviewedAt,
          createdAt: existingDoc.createdAt,
        }),
      };

      feedbackModelMock.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(existingDoc),
      });

      const result = await service.updateStatus(
        docId.toHexString(),
        {
          status: FeedbackStatus.RESOLVED,
          adminNote: 'Đã cập nhật giải thích cho đề này.',
        },
        admin,
      );

      expect(existingDoc.status).toBe(FeedbackStatus.RESOLVED);
      expect(existingDoc.adminNote).toBe('Đã cập nhật giải thích cho đề này.');
      expect(existingDoc.reviewedBy).toEqual(admin._id);
      expect(existingDoc.reviewedAt).toBeInstanceOf(Date);
      expect(existingDoc.save).toHaveBeenCalledTimes(1);

      expect(auditServiceMock.log).toHaveBeenCalledWith({
        action: 'FEEDBACK_STATUS_UPDATED',
        entityType: 'Feedback',
        entityId: docId,
        actorId: admin._id,
        metadata: { status: FeedbackStatus.RESOLVED },
      });

      expect(result).toEqual({
        id: docId.toHexString(),
        category: FeedbackCategory.CONTENT,
        rating: 4,
        content: 'Cần bổ sung giải thích đáp án chi tiết hơn.',
        status: FeedbackStatus.RESOLVED,
        adminNote: 'Đã cập nhật giải thích cho đề này.',
        reviewedAt: existingDoc.reviewedAt,
        createdAt,
      });
    });
  });

  describe('DTO validation', () => {
    it('trims content and rejects content shorter than 10 chars or invalid rating', async () => {
      const shortDto = plainToInstance(CreateFeedbackDto, {
        category: FeedbackCategory.OTHER,
        rating: 6,
        content: '   ngắn   ',
      });
      const errors = await validate(shortDto);
      const props = errors.map((e) => e.property);
      expect(props).toContain('rating');
      expect(props).toContain('content');
    });

    it('validates FeedbackQueryDto and UpdateFeedbackStatusDto', async () => {
      const badQuery = plainToInstance(FeedbackQueryDto, {
        page: '0',
        limit: '101',
      });
      const queryErrors = await validate(badQuery);
      expect(queryErrors.map((e) => e.property)).toEqual(
        expect.arrayContaining(['page', 'limit']),
      );

      const goodStatus = plainToInstance(UpdateFeedbackStatusDto, {
        status: FeedbackStatus.REVIEWED,
        adminNote: '  Đang xử lý  ',
      });
      expect(goodStatus.adminNote).toBe('Đang xử lý');
      expect(await validate(goodStatus)).toEqual([]);
    });
  });
});
