import { Schema } from 'mongoose';
import { AssignmentSchema } from './assignment.schema';
import { AuditLogSchema } from './audit-log.schema';
import { EmailDeliverySchema } from './email-delivery.schema';
import { FeedbackCategory, FeedbackStatus, NotificationType } from './enums';
import { ExamAttemptSchema } from './exam-attempt.schema';
import { ExtensionRequestSchema } from './extension-request.schema';
import { FeedbackSchema } from './feedback.schema';
import { NotificationSchema } from './notification.schema';
import { PenaltyTransactionSchema } from './penalty-transaction.schema';
import { StudentProfileSchema } from './student-profile.schema';
import { StudentStudyDailySchema } from './student-study-daily.schema';
import { TranslationSubmissionSchema } from './translation-submission.schema';
import { UserSchema } from './user.schema';

type IndexEntry = [Record<string, unknown>, Record<string, unknown>];

function findIndex(
  schema: Schema,
  expectedKeys: Record<string, unknown>,
): IndexEntry | undefined {
  const expectedEntries = Object.entries(expectedKeys);
  return (schema.indexes() as IndexEntry[]).find(([keys]) => {
    const actualEntries = Object.entries(keys);
    return (
      actualEntries.length === expectedEntries.length &&
      expectedEntries.every(([k, v], i) => actualEntries[i][0] === k && actualEntries[i][1] === v)
    );
  });
}

describe('MongoDB Schema & Index Integrity', () => {
  describe('TranslationSubmissionSchema', () => {
    it('replaces compound unique sparse indexes with partialFilterExpression unique indexes', () => {
      const indexes = TranslationSubmissionSchema.indexes() as IndexEntry[];
      const compoundUniqueSparse = indexes.filter(
        ([keys, opts]) => Object.keys(keys).length > 1 && opts.unique === true && opts.sparse === true,
      );
      expect(compoundUniqueSparse).toEqual([]);

      const assignmentPassageIdx = findIndex(TranslationSubmissionSchema, {
        studentAssignmentId: 1,
        passageId: 1,
      });
      expect(assignmentPassageIdx).toBeDefined();
      expect(assignmentPassageIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: {
          studentAssignmentId: { $type: 'objectId' },
        },
      });
      expect(assignmentPassageIdx![1].sparse).toBeUndefined();

      // MongoDB partialFilterExpression does NOT support { $exists: false } (error code 67)
      for (const [, opts] of indexes) {
        if (opts.partialFilterExpression) {
          expect(JSON.stringify(opts.partialFilterExpression)).not.toContain('"$exists":false');
        }
      }

      const standalonePassageIdx = findIndex(TranslationSubmissionSchema, {
        studentId: 1,
        testId: 1,
        passageId: 1,
      });
      expect(standalonePassageIdx).toBeDefined();
      expect(standalonePassageIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: {
          testId: { $type: 'objectId' },
          passageId: { $type: 'string' },
        },
      });
      expect(standalonePassageIdx![1].sparse).toBeUndefined();

      expect(findIndex(TranslationSubmissionSchema, { studentId: 1, status: 1 })).toBeDefined();
    });
  });

  describe('ExamAttemptSchema', () => {
    it('defines scorePercent (Number), passed (Boolean), and partial unique IN_PROGRESS index', () => {
      const scorePercentPath = ExamAttemptSchema.path('scorePercent');
      expect(scorePercentPath).toBeDefined();
      expect(scorePercentPath.instance).toBe('Number');

      const passedPath = ExamAttemptSchema.path('passed');
      expect(passedPath).toBeDefined();
      expect(passedPath.instance).toBe('Boolean');

      const activeAttemptIdx = findIndex(ExamAttemptSchema, {
        studentId: 1,
        testId: 1,
        mode: 1,
        partId: 1,
      });
      expect(activeAttemptIdx).toBeDefined();
      expect(activeAttemptIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: { status: 'IN_PROGRESS' },
      });

      expect(findIndex(ExamAttemptSchema, { studentId: 1, status: 1 })).toBeDefined();
      expect(findIndex(ExamAttemptSchema, { testId: 1, studentId: 1 })).toBeDefined();
      const idempotencyIdx = findIndex(ExamAttemptSchema, { idempotencyKey: 1 });
      expect(idempotencyIdx).toBeDefined();
      expect(idempotencyIdx![1]).toMatchObject({ unique: true, sparse: true });
    });
  });

  describe('AssignmentSchema', () => {
    it('defines optional examTestId referencing ExamTest while keeping required exerciseId', () => {
      const examTestIdPath = AssignmentSchema.path('examTestId');
      expect(examTestIdPath).toBeDefined();
      expect(examTestIdPath.options.ref).toBe('ExamTest');
      expect(examTestIdPath.isRequired).toBeFalsy();

      const exerciseIdPath = AssignmentSchema.path('exerciseId');
      expect(exerciseIdPath).toBeDefined();
      expect(exerciseIdPath.options.ref).toBe('Exercise');
      expect(exerciseIdPath.isRequired).toBe(true);
    });
  });

  describe('Redundant single-field prefix index removal', () => {
    it('NotificationSchema drops userId single-field index and preserves covering compound indexes', () => {
      expect(findIndex(NotificationSchema, { userId: 1 })).toBeUndefined();
      expect(NotificationSchema.path('userId').options.index).toBeUndefined();

      expect(findIndex(NotificationSchema, { userId: 1, createdAt: -1 })).toBeDefined();
      expect(findIndex(NotificationSchema, { userId: 1, isRead: 1 })).toBeDefined();
      expect(findIndex(NotificationSchema, { type: 1 })).toBeDefined();
      const idempotencyIdx = findIndex(NotificationSchema, { idempotencyKey: 1 });
      expect(idempotencyIdx).toBeDefined();
      expect(idempotencyIdx![1]).toMatchObject({ unique: true, sparse: true });
    });

    it('ExtensionRequestSchema drops studentAssignmentId/studentId/courseId single-field indexes and preserves compound indexes', () => {
      expect(findIndex(ExtensionRequestSchema, { studentAssignmentId: 1 })).toBeUndefined();
      expect(findIndex(ExtensionRequestSchema, { studentId: 1 })).toBeUndefined();
      expect(findIndex(ExtensionRequestSchema, { courseId: 1 })).toBeUndefined();
      expect(ExtensionRequestSchema.path('studentAssignmentId').options.index).toBeUndefined();
      expect(ExtensionRequestSchema.path('studentId').options.index).toBeUndefined();
      expect(ExtensionRequestSchema.path('courseId').options.index).toBeUndefined();

      expect(findIndex(ExtensionRequestSchema, { studentId: 1, createdAt: 1 })).toBeDefined();
      expect(findIndex(ExtensionRequestSchema, { courseId: 1, status: 1 })).toBeDefined();
      expect(findIndex(ExtensionRequestSchema, { status: 1 })).toBeDefined();
      const pendingIdx = findIndex(ExtensionRequestSchema, { studentAssignmentId: 1, status: 1 });
      expect(pendingIdx).toBeDefined();
      expect(pendingIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: { status: 'pending' },
        name: 'unique_pending_per_student_assignment',
      });
    });

    it('PenaltyTransactionSchema drops studentId single-field index and preserves covering compound index', () => {
      expect(findIndex(PenaltyTransactionSchema, { studentId: 1 })).toBeUndefined();
      expect(PenaltyTransactionSchema.path('studentId').options.index).toBeUndefined();

      expect(findIndex(PenaltyTransactionSchema, { studentId: 1, createdAt: -1 })).toBeDefined();
      expect(findIndex(PenaltyTransactionSchema, { studentAssignmentId: 1 })).toBeDefined();
      expect(findIndex(PenaltyTransactionSchema, { isReversed: 1 })).toBeDefined();
      const idempotencyIdx = findIndex(PenaltyTransactionSchema, { idempotencyKey: 1 });
      expect(idempotencyIdx).toBeDefined();
      expect(idempotencyIdx![1]).toMatchObject({ unique: true });
      const reversedIdx = findIndex(PenaltyTransactionSchema, { reversedTransactionId: 1 });
      expect(reversedIdx).toBeDefined();
      expect(reversedIdx![1]).toMatchObject({ unique: true, sparse: true });
    });

    it('AuditLogSchema drops action/entityType single-field indexes and preserves covering compound indexes', () => {
      expect(findIndex(AuditLogSchema, { action: 1 })).toBeUndefined();
      expect(findIndex(AuditLogSchema, { entityType: 1 })).toBeUndefined();
      expect(AuditLogSchema.path('action').options.index).toBeUndefined();
      expect(AuditLogSchema.path('entityType').options.index).toBeUndefined();

      expect(findIndex(AuditLogSchema, { actorId: 1, createdAt: -1 })).toBeDefined();
      expect(findIndex(AuditLogSchema, { entityType: 1, entityId: 1, createdAt: -1 })).toBeDefined();
      expect(findIndex(AuditLogSchema, { action: 1, createdAt: -1 })).toBeDefined();
    });

    it('EmailDeliverySchema drops status single-field index and preserves covering compound index', () => {
      expect(findIndex(EmailDeliverySchema, { status: 1 })).toBeUndefined();
      expect(EmailDeliverySchema.path('status').options.index).toBeUndefined();

      expect(findIndex(EmailDeliverySchema, { status: 1, createdAt: -1 })).toBeDefined();
      const idempotencyIdx = findIndex(EmailDeliverySchema, { idempotencyKey: 1 });
      expect(idempotencyIdx).toBeDefined();
      expect(idempotencyIdx![1]).toMatchObject({ unique: true });
    });
  });

  describe('Phase 12 Enums', () => {
    it('defines FeedbackCategory, FeedbackStatus, and NotificationType.ASSIGNMENT_SCHEDULE_REMINDER', () => {
      expect(FeedbackCategory).toEqual({
        CONTENT: 'CONTENT',
        SYSTEM_BUG: 'SYSTEM_BUG',
        TEACHING: 'TEACHING',
        FEATURE_REQUEST: 'FEATURE_REQUEST',
        OTHER: 'OTHER',
      });

      expect(FeedbackStatus).toEqual({
        NEW: 'NEW',
        REVIEWED: 'REVIEWED',
        RESOLVED: 'RESOLVED',
      });

      expect(NotificationType.ASSIGNMENT_SCHEDULE_REMINDER).toBe(
        'assignment_schedule_reminder',
      );
    });
  });

  describe('FeedbackSchema', () => {
    it('defines feedback fields, indexes, and enforces absolute DB-layer anonymity', () => {
      expect(FeedbackSchema.get('collection')).toBe('feedbacks');
      expect(FeedbackSchema.get('timestamps')).toBe(true);

      const categoryPath = FeedbackSchema.path('category');
      expect(categoryPath).toBeDefined();
      expect(categoryPath.instance).toBe('String');
      expect(categoryPath.isRequired).toBe(true);
      expect(categoryPath.options.enum).toEqual(Object.values(FeedbackCategory));

      const ratingPath = FeedbackSchema.path('rating');
      expect(ratingPath).toBeDefined();
      expect(ratingPath.instance).toBe('Number');
      expect(ratingPath.options.min).toBe(1);
      expect(ratingPath.options.max).toBe(5);

      const contentPath = FeedbackSchema.path('content');
      expect(contentPath).toBeDefined();
      expect(contentPath.instance).toBe('String');
      expect(contentPath.isRequired).toBe(true);
      expect(contentPath.options.trim).toBe(true);

      const statusPath = FeedbackSchema.path('status');
      expect(statusPath).toBeDefined();
      expect(statusPath.instance).toBe('String');
      expect(statusPath.options.enum).toEqual(Object.values(FeedbackStatus));
      expect(statusPath.options.default).toBe(FeedbackStatus.NEW);

      const adminNotePath = FeedbackSchema.path('adminNote');
      expect(adminNotePath).toBeDefined();
      expect(adminNotePath.instance).toBe('String');
      expect(adminNotePath.options.trim).toBe(true);

      const reviewedByPath = FeedbackSchema.path('reviewedBy');
      expect(reviewedByPath).toBeDefined();
      expect(reviewedByPath.options.ref).toBe('User');
      expect(reviewedByPath.isRequired).toBeFalsy();

      const reviewedAtPath = FeedbackSchema.path('reviewedAt');
      expect(reviewedAtPath).toBeDefined();
      expect(reviewedAtPath.instance).toBe('Date');

      expect(findIndex(FeedbackSchema, { status: 1, createdAt: -1 })).toBeDefined();
      expect(findIndex(FeedbackSchema, { category: 1, createdAt: -1 })).toBeDefined();

      // Absolute anonymity: PII / identity paths must NOT exist on FeedbackSchema
      for (const forbiddenField of [
        'studentId',
        'email',
        'fullName',
        'ipAddress',
        'userAgent',
      ]) {
        expect(FeedbackSchema.path(forbiddenField)).toBeUndefined();
      }
    });
  });

  describe('StudentStudyDailySchema', () => {
    it('defines daily study fields and unique/lookup indexes', () => {
      expect(StudentStudyDailySchema.get('collection')).toBe('student_study_daily');
      expect(StudentStudyDailySchema.get('timestamps')).toBe(true);

      const studentIdPath = StudentStudyDailySchema.path('studentId');
      expect(studentIdPath).toBeDefined();
      expect(studentIdPath.options.ref).toBe('User');
      expect(studentIdPath.isRequired).toBe(true);

      const dateVnPath = StudentStudyDailySchema.path('dateVn');
      expect(dateVnPath).toBeDefined();
      expect(dateVnPath.instance).toBe('String');
      expect(dateVnPath.isRequired).toBe(true);

      const studySecondsPath = StudentStudyDailySchema.path('studySeconds');
      expect(studySecondsPath).toBeDefined();
      expect(studySecondsPath.instance).toBe('Number');
      expect(studySecondsPath.isRequired).toBe(true);
      expect(studySecondsPath.options.default).toBe(0);
      expect(studySecondsPath.options.min).toBe(0);

      const heartbeatCountPath = StudentStudyDailySchema.path('heartbeatCount');
      expect(heartbeatCountPath).toBeDefined();
      expect(heartbeatCountPath.instance).toBe('Number');
      expect(heartbeatCountPath.options.default).toBe(0);
      expect(heartbeatCountPath.options.min).toBe(0);

      const lastHeartbeatAtPath = StudentStudyDailySchema.path('lastHeartbeatAt');
      expect(lastHeartbeatAtPath).toBeDefined();
      expect(lastHeartbeatAtPath.instance).toBe('Date');
      expect(lastHeartbeatAtPath.isRequired).toBe(true);

      const studentDateIdx = findIndex(StudentStudyDailySchema, {
        studentId: 1,
        dateVn: 1,
      });
      expect(studentDateIdx).toBeDefined();
      expect(studentDateIdx![1]).toMatchObject({ unique: true });

      expect(findIndex(StudentStudyDailySchema, { dateVn: 1 })).toBeDefined();
    });
  });

  describe('StudentProfileSchema', () => {
    it('defines totalStudySeconds (Number, default 0) and lastStudyHeartbeatAt (Date)', () => {
      const totalStudySecondsPath = StudentProfileSchema.path('totalStudySeconds');
      expect(totalStudySecondsPath).toBeDefined();
      expect(totalStudySecondsPath.instance).toBe('Number');
      expect(totalStudySecondsPath.options.default).toBe(0);
      expect(totalStudySecondsPath.options.min).toBe(0);

      const lastStudyHeartbeatAtPath = StudentProfileSchema.path(
        'lastStudyHeartbeatAt',
      );
      expect(lastStudyHeartbeatAtPath).toBeDefined();
      expect(lastStudyHeartbeatAtPath.instance).toBe('Date');
    });
  });

  describe('UserSchema', () => {
    it('defines mustChangePassword (Boolean, default false)', () => {
      const mustChangePasswordPath = UserSchema.path('mustChangePassword');
      expect(mustChangePasswordPath).toBeDefined();
      expect(mustChangePasswordPath.instance).toBe('Boolean');
      expect(mustChangePasswordPath.options.default).toBe(false);
    });
  });
});
