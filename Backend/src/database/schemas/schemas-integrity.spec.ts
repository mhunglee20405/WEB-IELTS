import { Schema } from 'mongoose';
import { AssignmentSchema } from './assignment.schema';
import { AuditLogSchema } from './audit-log.schema';
import { EmailDeliverySchema } from './email-delivery.schema';
import { ExamAttemptSchema } from './exam-attempt.schema';
import { ExtensionRequestSchema } from './extension-request.schema';
import { NotificationSchema } from './notification.schema';
import { PenaltyTransactionSchema } from './penalty-transaction.schema';
import { TranslationSubmissionSchema } from './translation-submission.schema';
import { PassageVocabSchema } from './passage-vocab.schema';
import { UserVocabNotebookSchema } from './user-vocab-notebook.schema';

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
          passageId: { $type: 'string' },
        },
      });
      expect(assignmentPassageIdx![1].sparse).toBeUndefined();

      const legacyAssignmentIdx = findIndex(TranslationSubmissionSchema, {
        studentAssignmentId: 1,
      });
      expect(legacyAssignmentIdx).toBeDefined();
      expect(legacyAssignmentIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: {
          studentAssignmentId: { $type: 'objectId' },
          passageId: { $exists: false },
        },
      });
      expect(legacyAssignmentIdx![1].sparse).toBeUndefined();

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

    it('PassageVocabSchema and UserVocabNotebookSchema enforce partialFilterExpression deduplication', () => {
      const passageUniqueIdx = findIndex(PassageVocabSchema, {
        passageId: 1,
        normalizedWord: 1,
      });
      expect(passageUniqueIdx).toBeDefined();
      expect(passageUniqueIdx![1]).toMatchObject({ unique: true });

      const userPassageIdx = findIndex(UserVocabNotebookSchema, {
        userId: 1,
        passageId: 1,
        normalizedWord: 1,
      });
      expect(userPassageIdx).toBeDefined();
      expect(userPassageIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: { passageId: { $type: 'string' } },
      });
      expect(userPassageIdx![1].sparse).toBeUndefined();

      const userStandaloneIdx = findIndex(UserVocabNotebookSchema, {
        userId: 1,
        normalizedWord: 1,
      });
      expect(userStandaloneIdx).toBeDefined();
      expect(userStandaloneIdx![1]).toMatchObject({
        unique: true,
        partialFilterExpression: { passageId: { $exists: false } },
      });
      expect(userStandaloneIdx![1].sparse).toBeUndefined();
    });
  });
});
