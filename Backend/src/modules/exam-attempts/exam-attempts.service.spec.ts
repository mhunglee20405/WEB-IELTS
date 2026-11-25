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
import { Course } from 'src/database/schemas/course.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  ExamTestStatus,
  AttemptStatus,
  PartType,
  ExamQuestionType,
  StudentAssignmentStatus,
  EnrollmentStatus,
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
  let courseModel: any;
  let enrollmentModel: any;
  let connection: any;

  const studentId = new Types.ObjectId();
  const otherStudentId = new Types.ObjectId();
  const teacherOwnerId = new Types.ObjectId();
  const otherTeacherId = new Types.ObjectId();
  const testId = new Types.ObjectId();
  const part1Id = new Types.ObjectId();
  const part2Id = new Types.ObjectId();

  const student = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const otherStudent = {
    _id: otherStudentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherOwner = {
    _id: teacherOwnerId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const otherTeacher = {
    _id: otherTeacherId,
    role: UserRole.TEACHER,
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
    createdBy: teacherOwnerId,
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
    examAttemptModel.findOneAndUpdate = jest.fn().mockImplementation((filter: any, update: any) => ({
      exec: jest.fn().mockImplementation(async () => {
        const setFields = update?.$set || {};
        const incFields = update?.$inc || {};
        return mockDoc({
          _id: filter?._id || new Types.ObjectId(),
          studentId,
          testId,
          skill: ExamSkill.READING,
          mode: ExamMode.PART,
          partId: part1Id.toHexString(),
          scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
          startedAt: new Date(Date.now() - 10000),
          ...setFields,
          answersRevision:
            typeof filter?.answersRevision === 'number' && typeof incFields?.answersRevision === 'number'
              ? filter.answersRevision + incFields.answersRevision
              : setFields.answersRevision ?? 0,
        });
      }),
    }));
    examAttemptModel.find = jest.fn();
    examAttemptModel.countDocuments = jest.fn();

    examTestModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleTestDoc),
      }),
    };

    assignmentModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    studentAssignmentModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    submissionModel = jest.fn().mockImplementation((dto) => mockDoc(dto));
    submissionModel.countDocuments = jest.fn().mockResolvedValue(0);
    submissionModel.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    courseModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    enrollmentModel = {
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest.fn().mockImplementation(async (cb: any) => cb()),
        endSession: jest.fn().mockResolvedValue(true),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamAttemptsService,
        { provide: getModelToken(ExamAttempt.name), useValue: examAttemptModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Submission.name), useValue: submissionModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
        { provide: getConnectionToken(), useValue: connection },
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

    it('scopes idempotencyKey lookup by studentId and does not return another student attempt', async () => {
      examAttemptModel.findOne.mockImplementation((filter: any) => ({
        exec: jest.fn().mockResolvedValue(
          filter.studentId === otherStudentId
            ? {
                _id: new Types.ObjectId(),
                studentId: otherStudentId,
                testId,
                mode: ExamMode.PART,
                partId: part1Id.toHexString(),
                status: AttemptStatus.IN_PROGRESS,
                startedAt: new Date(),
                expiresAt: new Date(Date.now() + 600000),
                scopeQuestionIds: ['1'],
                savedAnswers: new Map(),
              }
            : null,
        ),
      }));

      const res = await service.createAttempt(
        {
          testId: testId.toHexString(),
          mode: ExamMode.PART,
          partId: part1Id.toHexString(),
          idempotencyKey: 'shared-idem-key',
        },
        student,
      );

      expect(examAttemptModel.findOne).toHaveBeenCalledWith({
        idempotencyKey: 'shared-idem-key',
        studentId: student._id,
      });
      expect(res).toBeDefined();
    });

    it('handles MongoDB E11000 on concurrent createAttempt without throwing 500', async () => {
      const existingAttemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        exerciseVersion: 1,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        startedAt: new Date(),
        expiresAt: new Date(Date.now() + 600000),
        scopeQuestionIds: ['1'],
        savedAnswers: new Map(),
      };

      // Initial checks see null, save hits 11000, recovery finds existing active attempt
      examAttemptModel.findOne
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(null) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(existingAttemptDoc) });

      examAttemptModel.mockImplementationOnce((dto: any) => ({
        ...dto,
        save: jest.fn().mockRejectedValue({ code: 11000 }),
      }));

      const res = await service.createAttempt(
        {
          testId: testId.toHexString(),
          mode: ExamMode.PART,
          partId: part1Id.toHexString(),
        },
        student,
      );

      expect(res.attemptId).toBe(existingAttemptDoc._id.toHexString());
    });

    it('rejects createAttempt when assignment allowRetake is false and sa.attemptsCount >= 1', async () => {
      const assignmentId = new Types.ObjectId();
      const saId = new Types.ObjectId();

      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: saId,
          assignmentId,
          studentId,
          attemptsCount: 1,
          status: StudentAssignmentStatus.SUBMITTED,
        }),
      });
      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: assignmentId,
          exerciseId: testId,
          allowRetake: false,
          openAt: new Date(Date.now() - 3600000),
          deadlineAt: new Date(Date.now() + 3600000),
        }),
      });

      await expect(
        service.createAttempt(
          {
            testId: testId.toHexString(),
            studentAssignmentId: saId.toHexString(),
            mode: ExamMode.PART,
            partId: part1Id.toHexString(),
          },
          student,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects createAttempt when sa.attemptsCount >= maxAttempts', async () => {
      const assignmentId = new Types.ObjectId();
      const saId = new Types.ObjectId();

      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: saId,
          assignmentId,
          studentId,
          attemptsCount: 2,
          status: StudentAssignmentStatus.SUBMITTED,
        }),
      });
      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: assignmentId,
          exerciseId: testId,
          allowRetake: true,
          maxAttempts: 2,
          openAt: new Date(Date.now() - 3600000),
          deadlineAt: new Date(Date.now() + 3600000),
        }),
      });

      await expect(
        service.createAttempt(
          {
            testId: testId.toHexString(),
            studentAssignmentId: saId.toHexString(),
            mode: ExamMode.PART,
            partId: part1Id.toHexString(),
          },
          student,
        ),
      ).rejects.toThrow(BadRequestException);
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

    it('uses atomic findOneAndUpdate and throws ConflictException when concurrent update returns null', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        status: AttemptStatus.IN_PROGRESS,
        answersRevision: 2,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map(),
        expiresAt: new Date(Date.now() + 600000),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });
      examAttemptModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.saveAnswers(
          attemptDoc._id.toHexString(),
          {
            baseRevision: 2,
            answers: [{ questionId: '1', value: 'TRUE' }],
          },
          student,
        ),
      ).rejects.toThrow(ConflictException);

      expect(examAttemptModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          _id: attemptDoc._id,
          status: AttemptStatus.IN_PROGRESS,
          answersRevision: 2,
        }),
        expect.objectContaining({
          $inc: { answersRevision: 1 },
        }),
        { new: true },
      );
    });

    it('auto-submits full submission and StudentAssignment when saveAnswers sees expiresAt <= now', async () => {
      const assignmentId = new Types.ObjectId();
      const saId = new Types.ObjectId();
      const saDoc = {
        _id: saId,
        assignmentId,
        studentId,
        attemptsCount: 0,
        bestScore: 0,
        isTargetAchieved: false,
        status: StudentAssignmentStatus.IN_PROGRESS,
        save: jest.fn().mockResolvedValue(true),
      };
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        assignmentId,
        studentAssignmentId: saId,
        exerciseVersion: 1,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        answersRevision: 1,
        scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        savedAnswers: new Map([
          ['1', 'TRUE'],
          ['2', 'FALSE'],
          ['3', 'NOT GIVEN'],
          ['4', 'TRUE'],
          ['5', 'FALSE'],
          ['6', 'TRUE'],
          ['7', 'TRUE'],
        ]),
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago (without +10s grace)
      };

      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(saDoc),
      });
      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: assignmentId, targetScorePercent: 70 }),
      });

      const createdSubs: any[] = [];
      submissionModel.mockImplementation((dto: any) => {
        const doc = { ...dto, _id: new Types.ObjectId(), save: jest.fn().mockResolvedValue(dto) };
        createdSubs.push(doc);
        return doc;
      });

      await expect(
        service.saveAnswers(
          attemptDoc._id.toHexString(),
          {
            baseRevision: 1,
            answers: [{ questionId: '8', value: 'FALSE' }],
          },
          student,
        ),
      ).rejects.toThrow(BadRequestException);

      expect(examAttemptModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: attemptDoc._id, status: AttemptStatus.IN_PROGRESS }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: AttemptStatus.AUTO_SUBMITTED,
            scorePercent: 70,
            passed: true,
          }),
        }),
        expect.anything(),
      );
      expect(createdSubs).toHaveLength(1);
      expect(createdSubs[0].scorePercent).toBe(70);
      expect(saDoc.attemptsCount).toBe(1);
      expect(saDoc.status).toBe(StudentAssignmentStatus.PASSED);
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
      expect(res.answerReviewAvailable).toBe(true);
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

    it('merges answers and flaggedQuestionIds passed in submit dto before grading', async () => {
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
          ['1', 'WRONG'],
          ['2', 'WRONG'],
        ]),
        flaggedQuestionIds: [] as string[],
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      const res = await service.submitAttempt(
        attemptDoc._id.toHexString(),
        {
          expectedRevision: 5,
          answers: {
            '1': 'TRUE',
            '2': 'FALSE',
            '3': 'NOT GIVEN',
            '4': 'TRUE',
            '5': 'FALSE',
            '6': 'TRUE',
            '7': 'TRUE',
          },
          flaggedQuestionIds: ['1', '7'],
        },
        student,
      );
      expect(res.correctCount).toBe(7);
      expect(res.scorePercent).toBe(70);
      expect(res.passed).toBe(true);
      expect(attemptDoc.flaggedQuestionIds).toEqual(['1', '7']);
      expect(attemptDoc.savedAnswers.get('1')).toBe('TRUE');
    });

    it('rejects EXPIRED attempts with BadRequestException', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        status: AttemptStatus.EXPIRED,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map(),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      await expect(
        service.submitAttempt(attemptDoc._id.toHexString(), {}, student),
      ).rejects.toThrow(BadRequestException);
    });

    it('marks AUTO_SUBMITTED and ignores dto.answers when now > attempt.expiresAt', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        expiresAt: new Date(Date.now() - 5000),
        scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        savedAnswers: new Map([['1', 'TRUE']]),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      const res = await service.submitAttempt(
        attemptDoc._id.toHexString(),
        {
          answers: {
            '2': 'FALSE',
            '3': 'NOT GIVEN',
            '4': 'TRUE',
            '5': 'FALSE',
            '6': 'TRUE',
            '7': 'TRUE',
            '8': 'FALSE',
          },
        },
        student,
      );

      // Only the previously saved '1' is graded -> 1/10 = 10%
      expect(res.correctCount).toBe(1);
      expect(res.scorePercent).toBe(10);
      expect(examAttemptModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ _id: attemptDoc._id, status: AttemptStatus.IN_PROGRESS }),
        expect.objectContaining({
          $set: expect.objectContaining({
            status: AttemptStatus.AUTO_SUBMITTED,
            scorePercent: 10,
            passed: false,
          }),
        }),
        expect.objectContaining({ new: true }),
      );
    });

    it('prevents duplicate Submission on concurrent submitAttempt race when findOneAndUpdate returns null', async () => {
      const saId = new Types.ObjectId();
      const existingSubId = new Types.ObjectId();
      const attemptId = new Types.ObjectId();
      const inProgressDoc = {
        _id: attemptId,
        studentId,
        testId,
        studentAssignmentId: saId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map([['1', 'TRUE']]),
      };
      const finalizedDoc = {
        ...inProgressDoc,
        status: AttemptStatus.SUBMITTED,
        scorePercent: 50,
        passed: false,
        submittedAt: new Date(),
      };

      examAttemptModel.findById
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(inProgressDoc) })
        .mockReturnValueOnce({ exec: jest.fn().mockResolvedValue(finalizedDoc) });

      examAttemptModel.findOneAndUpdate.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });
      submissionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: existingSubId }),
      });

      const createdSubs: any[] = [];
      submissionModel.mockImplementation((dto: any) => {
        createdSubs.push(dto);
        return { ...dto, save: jest.fn() };
      });

      const res = await service.submitAttempt(attemptId.toHexString(), {}, student);

      expect(connection.startSession).toHaveBeenCalled();
      expect(createdSubs).toHaveLength(0);
      expect(res.submissionId).toBe(existingSubId.toHexString());
      expect(res.scorePercent).toBe(50);
    });

    it('evaluates pass against assignment.targetScorePercent (85%), persists scorePercent/passed, and never regresses isTargetAchieved on failed retake', async () => {
      const assignmentId = new Types.ObjectId();
      const saId = new Types.ObjectId();
      const saDoc = {
        _id: saId,
        assignmentId,
        studentId,
        attemptsCount: 1,
        bestScore: 90,
        isTargetAchieved: true,
        status: StudentAssignmentStatus.PASSED,
        passedAt: new Date(Date.now() - 86400000),
        save: jest.fn().mockResolvedValue(true),
      };

      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: assignmentId,
          targetScorePercent: 85,
        }),
      });
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(saDoc),
      });

      // Attempt 1: 7/10 = 70% (< 85% targetScorePercent -> failed)
      const attempt1Doc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        assignmentId,
        studentAssignmentId: saId,
        exerciseVersion: 1,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'],
        savedAnswers: new Map([
          ['1', 'TRUE'],
          ['2', 'FALSE'],
          ['3', 'NOT GIVEN'],
          ['4', 'TRUE'],
          ['5', 'FALSE'],
          ['6', 'TRUE'],
          ['7', 'TRUE'],
        ]),
      };

      // Pretend student had NOT achieved target before for Attempt 1
      const saFirst = {
        ...saDoc,
        attemptsCount: 0,
        bestScore: 0,
        isTargetAchieved: false,
        status: StudentAssignmentStatus.IN_PROGRESS,
        passedAt: undefined,
        save: jest.fn().mockResolvedValue(true),
      };
      studentAssignmentModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(saFirst),
      });
      examAttemptModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(attempt1Doc),
      });

      const res1 = await service.submitAttempt(attempt1Doc._id.toHexString(), {}, student);
      expect(res1.scorePercent).toBe(70);
      expect(res1.passed).toBe(false);
      expect(res1.passThresholdPercent).toBe(85);
      expect(saFirst.isTargetAchieved).toBe(false);
      expect(saFirst.status).toBe(StudentAssignmentStatus.SUBMITTED);
      expect(examAttemptModel.findOneAndUpdate).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          $set: expect.objectContaining({
            scorePercent: 70,
            passed: false,
          }),
        }),
        expect.anything(),
      );

      // Attempt 2 (retake after previously passing): scores 50% -> must NOT regress isTargetAchieved/PASSED
      const attempt2Doc = {
        ...attempt1Doc,
        _id: new Types.ObjectId(),
        status: AttemptStatus.IN_PROGRESS,
        submittedAt: undefined,
        scorePercent: undefined,
        passed: undefined,
        savedAnswers: new Map([
          ['1', 'TRUE'],
          ['2', 'FALSE'],
          ['3', 'NOT GIVEN'],
          ['4', 'TRUE'],
          ['5', 'FALSE'],
        ]),
      };
      studentAssignmentModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(saDoc),
      });
      examAttemptModel.findById.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(attempt2Doc),
      });

      const res2 = await service.submitAttempt(attempt2Doc._id.toHexString(), {}, student);
      expect(res2.scorePercent).toBe(50);
      expect(res2.passed).toBe(false);
      expect(saDoc.isTargetAchieved).toBe(true);
      expect(saDoc.status).toBe(StudentAssignmentStatus.PASSED);
      expect(saDoc.bestScore).toBe(90);
    });
  });

  describe('getResult, getAttempt, and getReview (cheating oracle & teacher ownership)', () => {
    it('getResult throws BadRequestException while attempt is IN_PROGRESS', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map([['1', 'TRUE']]),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      await expect(service.getResult(attemptDoc._id.toHexString(), student)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('blocks unrelated teacher from getAttempt, getResult, and getReview with ForbiddenException', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map([['1', 'TRUE']]),
        startedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      await expect(service.getAttempt(attemptDoc._id.toHexString(), otherTeacher)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getResult(attemptDoc._id.toHexString(), otherTeacher)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(service.getReview(attemptDoc._id.toHexString(), otherTeacher)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows owning teacher or teacher with active enrollment for student', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map([['1', 'TRUE']]),
        startedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });

      // Owning teacher (sampleTestDoc.createdBy === teacherOwnerId)
      const ownedRes = await service.getResult(attemptDoc._id.toHexString(), teacherOwner);
      expect(ownedRes.scorePercent).toBe(100);

      // Non-creator teacher who has active enrollment for the student
      const sharedCourseId = new Types.ObjectId();
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: sharedCourseId, teacherId: otherTeacherId }]),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          courseId: sharedCourseId,
          studentId,
          status: EnrollmentStatus.ACTIVE,
        }),
      });

      const enrolledTeacherReview = await service.getReview(attemptDoc._id.toHexString(), otherTeacher);
      expect(enrolledTeacherReview.scorePercent).toBe(100);
    });

    it('allows teacher who owns the Course of attempt.assignmentId', async () => {
      const assignmentId = new Types.ObjectId();
      const courseId = new Types.ObjectId();
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        assignmentId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map([['1', 'TRUE']]),
        startedAt: new Date(Date.now() - 60000),
        expiresAt: new Date(Date.now() + 60000),
      };
      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(attemptDoc),
      });
      assignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: assignmentId, courseId }),
      });
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId: otherTeacherId }),
      });

      const attemptRes = await service.getAttempt(attemptDoc._id.toHexString(), otherTeacher);
      expect(attemptRes.attemptId).toBe(attemptDoc._id.toHexString());
    });
  });

  describe('submitAttempt unfinalized AUTO_SUBMITTED & idempotency', () => {
    it('returns idempotently ONLY when AUTO_SUBMITTED already has finalized Submission, and finalizes if Submission is missing', async () => {
      const assignmentId = new Types.ObjectId();
      const saId = new Types.ObjectId();
      const subId = new Types.ObjectId();
      const saDoc = {
        _id: saId,
        assignmentId,
        studentId,
        attemptsCount: 0,
        bestScore: 0,
        isTargetAchieved: false,
        status: StudentAssignmentStatus.IN_PROGRESS,
        save: jest.fn().mockResolvedValue(true),
      };
      const unfinalizedAutoDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        assignmentId,
        studentAssignmentId: saId,
        exerciseVersion: 1,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.AUTO_SUBMITTED,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map([['1', 'TRUE'], ['2', 'FALSE']]),
      };

      examAttemptModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(unfinalizedAutoDoc),
      });
      studentAssignmentModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(saDoc),
      });
      submissionModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

      const createdSubs: any[] = [];
      submissionModel.mockImplementation((dto: any) => {
        const doc = { ...dto, _id: subId, save: jest.fn().mockResolvedValue(dto) };
        createdSubs.push(doc);
        return doc;
      });

      // Unfinalized AUTO_SUBMITTED (no Submission, no submittedAt): finalizes once ignoring late dto.answers
      const res1 = await service.submitAttempt(
        unfinalizedAutoDoc._id.toHexString(),
        { answers: { '1': 'WRONG' } },
        student,
      );
      expect(createdSubs).toHaveLength(1);
      expect(res1.scorePercent).toBe(100);
      expect(saDoc.attemptsCount).toBe(1);

      // Finalized AUTO_SUBMITTED (Submission exists): returns idempotently without creating another Submission
      submissionModel.findOne.mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ _id: subId }),
      });
      const res2 = await service.submitAttempt(
        unfinalizedAutoDoc._id.toHexString(),
        {},
        student,
      );
      expect(createdSubs).toHaveLength(1);
      expect(res2.submissionId).toBe(subId.toHexString());
    });
  });

  describe('findAllForStudent', () => {
    it('returns persisted scorePercent and passed instead of null', async () => {
      const attemptId = new Types.ObjectId();
      const attemptDocs = [
        {
          _id: attemptId,
          testId: { _id: testId, title: 'Sample Test' },
          skill: ExamSkill.READING,
          mode: ExamMode.PART,
          partId: part1Id.toHexString(),
          status: AttemptStatus.SUBMITTED,
          scorePercent: 80,
          passed: true,
          startedAt: new Date(Date.now() - 120000),
          submittedAt: new Date(),
        },
      ];
      const chain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        populate: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue(attemptDocs),
      };
      examAttemptModel.find.mockReturnValue(chain);
      examAttemptModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.findAllForStudent(student, {});
      expect(res.items[0].scorePercent).toBe(80);
      expect(res.items[0].passed).toBe(true);
    });
  });

  describe('getReview', () => {
    it('allows student to review answers even if attempt score < 70%', async () => {
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

      const review = await service.getReview(attemptDoc._id.toHexString(), student);
      expect(review.items).toBeDefined();
    });

    it('throws 403 if attempt is still IN_PROGRESS', async () => {
      const attemptDoc = {
        _id: new Types.ObjectId(),
        studentId,
        testId,
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        partId: part1Id.toHexString(),
        status: AttemptStatus.IN_PROGRESS,
        scopeQuestionIds: ['1', '2'],
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

