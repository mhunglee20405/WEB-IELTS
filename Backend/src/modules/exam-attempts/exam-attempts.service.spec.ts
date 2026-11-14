import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ExamAttemptsService } from './exam-attempts.service';
import { ExamAttempt } from 'src/database/schemas/exam-attempt.schema';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Submission } from 'src/database/schemas/submission.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  ExamTestStatus,
  AttemptStatus,
  PartType,
  ExamQuestionType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('ExamAttemptsService', () => {
  let service: ExamAttemptsService;
  let examAttemptModel: any;
  let examTestModel: any;
  let assignmentModel: any;
  let studentAssignmentModel: any;
  let submissionModel: any;

  const studentId = new Types.ObjectId();
  const testId = new Types.ObjectId();
  const part1Id = new Types.ObjectId();
  const part2Id = new Types.ObjectId();

  const student = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const sampleTestDoc = {
    _id: testId,
    title: 'Sample Test',
    skill: ExamSkill.READING,
    status: ExamTestStatus.PUBLISHED,
    allowedModes: [ExamMode.PART, ExamMode.FULL],
    passScore: 70,
    version: 1,
    fullDurationSeconds: 3600,
    parts: [
      {
        _id: part1Id,
        ordinal: 1,
        type: PartType.PASSAGE,
        title: 'Passage 1',
        durationSeconds: 1200,
        questionGroups: [
          {
            _id: new Types.ObjectId(),
            type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
            questions: [
              { number: 1, prompt: 'Q1', points: 1, grading: { acceptedKeys: ['TRUE'] } },
              { number: 2, prompt: 'Q2', points: 1, grading: { acceptedKeys: ['FALSE'] } },
              { number: 3, prompt: 'Q3', points: 1, grading: { acceptedKeys: ['NOT GIVEN'] } },
              { number: 4, prompt: 'Q4', points: 1, grading: { acceptedKeys: ['TRUE'] } },
              { number: 5, prompt: 'Q5', points: 1, grading: { acceptedKeys: ['FALSE'] } },
              { number: 6, prompt: 'Q6', points: 1, grading: { acceptedKeys: ['TRUE'] } },
              { number: 7, prompt: 'Q7', points: 1, grading: { acceptedKeys: ['TRUE'] } },
              { number: 8, prompt: 'Q8', points: 1, grading: { acceptedKeys: ['FALSE'] } },
              { number: 9, prompt: 'Q9', points: 1, grading: { acceptedKeys: ['TRUE'] } },
              { number: 10, prompt: 'Q10', points: 1, grading: { acceptedKeys: ['TRUE'] } },
            ],
          },
        ],
      },
    ],
    toObject: () => sampleTestDoc,
  };

  beforeEach(async () => {
    function mockDoc(obj: any) {
      return {
        ...obj,
        _id: obj._id || new Types.ObjectId(),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
        toObject: jest.fn().mockReturnValue(obj),
      };
    }

    examAttemptModel = jest.fn().mockImplementation((dto) => mockDoc(dto));
    examAttemptModel.findById = jest.fn();
    examAttemptModel.findOne = jest.fn();
    examAttemptModel.find = jest.fn();
    examAttemptModel.countDocuments = jest.fn();

    examTestModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleTestDoc),
      }),
    };

    assignmentModel = {
      findById: jest.fn(),
    };

    studentAssignmentModel = {
      findById: jest.fn(),
    };

    submissionModel = jest.fn().mockImplementation((dto) => mockDoc(dto));
    submissionModel.countDocuments = jest.fn().mockResolvedValue(0);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamAttemptsService,
        { provide: getModelToken(ExamAttempt.name), useValue: examAttemptModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Submission.name), useValue: submissionModel },
        { provide: getConnectionToken(), useValue: {} },
      ],
    }).compile();

    service = module.get<ExamAttemptsService>(ExamAttemptsService);
  });

  describe('createAttempt', () => {
    it('creates a PART attempt when valid partId is provided', async () => {
      examAttemptModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.createAttempt(
        {
          testId: testId.toHexString(),
          mode: ExamMode.PART,
          partId: part1Id.toHexString(),
        },
        student,
      );

      expect(res).toBeDefined();
      expect(res.mode).toBe(ExamMode.PART);
      expect(res.partId).toBe(part1Id.toHexString());
      expect(res.scopeQuestionIds).toHaveLength(10);
    });

    it('rejects PART attempt without partId with 400', async () => {
      await expect(
        service.createAttempt(
          {
            testId: testId.toHexString(),
            mode: ExamMode.PART,
          },
          student,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects FULL attempt with partId with 400', async () => {
      await expect(
        service.createAttempt(
          {
            testId: testId.toHexString(),
            mode: ExamMode.FULL,
            partId: part1Id.toHexString(),
          },
          student,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws 409 Conflict if student already has active IN_PROGRESS attempt', async () => {
      examAttemptModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: new Types.ObjectId(),
          status: AttemptStatus.IN_PROGRESS,
          expiresAt: new Date(Date.now() + 600000),
        }),
      });

      await expect(
        service.createAttempt(
          {
            testId: testId.toHexString(),
            mode: ExamMode.PART,
            partId: part1Id.toHexString(),
          },
          student,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('saveAnswers & optimistic concurrency', () => {
    it('saves answers and increments answersRevision', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        status: AttemptStatus.IN_PROGRESS,
        answersRevision: 2,
        scopeQuestionIds: ['1', '2', '3'],
        savedAnswers: new Map([['1', 'TRUE']]),
        expiresAt: new Date(Date.now() + 600000),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      const res = await service.saveAnswers(
        attemptDoc._id.toHexString(),
        {
          baseRevision: 2,
          answers: [{ questionId: '2', value: 'FALSE' }],
        },
        student,
      );

      expect(res.answersRevision).toBe(3);
      expect(res.savedQuestionIds).toContain('2');
    });

    it('throws 409 Conflict if baseRevision does not match current answersRevision', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        status: AttemptStatus.IN_PROGRESS,
        answersRevision: 5,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map(),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      await expect(
        service.saveAnswers(
          attemptDoc._id.toHexString(),
          {
            baseRevision: 4, // stale revision
            answers: [{ questionId: '1', value: 'TRUE' }],
          },
          student,
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('submitAttempt & 70% PASS Threshold', () => {
    it('grades 6 correct out of 10 (60%): FAILED, does not unlock translation', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        savedAnswers: new Map([
          ['1', 'TRUE'], // 1
          ['2', 'FALSE'], // 2
          ['3', 'NOT GIVEN'], // 3
          ['4', 'TRUE'], // 4
          ['5', 'FALSE'], // 5
          ['6', 'TRUE'], // 6 (60%)
          ['7', 'WRONG'],
          ['8', 'WRONG'],
          ['9', 'WRONG'],
          ['10', 'WRONG'],
        ]),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      const res = await service.submitAttempt(attemptDoc._id.toHexString(), {}, student);
      expect(res.correctCount).toBe(6);
      expect(res.scorePercent).toBe(60);
      expect(res.passed).toBe(false);
      expect(res.answerReviewAvailable).toBe(false);
      expect(res.translation.available).toBe(false);
      expect(res.translation.unlockedPassageIds).toHaveLength(0);
    });

    it('grades 7 correct out of 10 (70%): PASSED, unlocks translation for that passage', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        savedAnswers: new Map([
          ['1', 'TRUE'], // 1
          ['2', 'FALSE'], // 2
          ['3', 'NOT GIVEN'], // 3
          ['4', 'TRUE'], // 4
          ['5', 'FALSE'], // 5
          ['6', 'TRUE'], // 6
          ['7', 'TRUE'], // 7 (70% exact)
          ['8', 'WRONG'],
          ['9', 'WRONG'],
          ['10', 'WRONG'],
        ]),
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      const res = await service.submitAttempt(attemptDoc._id.toHexString(), {}, student);
      expect(res.correctCount).toBe(7);
      expect(res.scorePercent).toBe(70);
      expect(res.passed).toBe(true);
      expect(res.answerReviewAvailable).toBe(true);
      expect(res.translation.available).toBe(true);
      expect(res.translation.unlockedPassageIds).toEqual([part1Id.toHexString()]);
    });
  });

  describe('getReview', () => {
    it('throws 403 ANSWER_REVIEW_LOCKED if attempt score < 70%', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map([
          ['1', 'WRONG'],
          ['2', 'WRONG'],
        ]),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      await expect(service.getReview(attemptDoc._id.toHexString(), student)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

