import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken, getConnectionToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { SubmissionsService, normalizeText, normalizeTFNG } from './submissions.service';
import { Submission } from 'src/database/schemas/submission.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Course } from 'src/database/schemas/course.schema';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  ExerciseType,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('SubmissionsService', () => {
  let service: SubmissionsService;
  let submissionModel: any;
  let assignmentModel: any;
  let courseModel: any;
  let studentAssignmentModel: any;
  let connection: any;

  const studentId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const studentAssignmentId = new Types.ObjectId();
  const courseId = new Types.ObjectId();

  const studentActor = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherActor = {
    _id: teacherId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const mockSnapshot = {
    title: 'IELTS Academic Reading 1',
    type: ExerciseType.READING,
    passScore: 70,
    version: 1,
    questions: [
      {
        questionId: 'q-mcq',
        type: QuestionType.MULTIPLE_CHOICE,
        prompt: 'Main reason?',
        points: 1,
        options: [
          { key: 'A', text: 'Steam' },
          { key: 'B', text: 'Coal' },
        ],
        answerSpecification: { correctKey: 'A' },
        explanation: 'Paragraph 1',
      },
      {
        questionId: 'q-tfng',
        type: QuestionType.TRUE_FALSE_NOT_GIVEN,
        prompt: 'Was coal cheaper?',
        points: 1,
        answerSpecification: { correctKey: 'TRUE' },
        explanation: 'Paragraph 2',
      },
      {
        questionId: 'q-fib',
        type: QuestionType.FILL_BLANK,
        prompt: 'The machine was invented in ___',
        points: 2, // Weighted 2 points
        answerSpecification: {
          acceptedAnswers: ['18th century', 'the 18th century'],
          caseSensitive: false,
        },
        explanation: 'Paragraph 3',
      },
    ],
  };

  const sampleAssignment = {
    _id: assignmentId,
    courseId,
    status: AssignmentStatus.PUBLISHED,
    allowRetake: true,
    maxAttempts: 3,
    exerciseVersion: 1,
    exerciseSnapshot: mockSnapshot,
  };

  const sampleStudentAssignment = {
    _id: studentAssignmentId,
    assignmentId,
    studentId,
    status: StudentAssignmentStatus.NOT_STARTED,
    bestScore: 0,
    save: jest.fn().mockResolvedValue(true),
  };

  beforeEach(async () => {
    function MockSubmissionInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
      this.toObject = jest.fn().mockReturnValue({ ...this });
    }

    submissionModel = MockSubmissionInstance;
    submissionModel.find = jest.fn();
    submissionModel.findOne = jest.fn();
    submissionModel.findById = jest.fn();
    submissionModel.countDocuments = jest.fn();

    assignmentModel = {
      findById: jest.fn(),
    };

    courseModel = {
      findById: jest.fn(),
    };

    studentAssignmentModel = {
      findOne: jest.fn(),
    };

    connection = {
      startSession: jest.fn().mockResolvedValue({
        withTransaction: jest.fn().mockImplementation(async (cb: any) => {
          return await cb();
        }),
        endSession: jest.fn().mockResolvedValue(true),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SubmissionsService,
        { provide: getModelToken(Submission.name), useValue: submissionModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getConnectionToken(), useValue: connection },
      ],
    }).compile();

    service = module.get<SubmissionsService>(SubmissionsService);
  });

  describe('Auto-Grading Normalization', () => {
    it('normalizes whitespace and case correctly', () => {
      expect(normalizeText('  The   18th   Century  ', false)).toBe('the 18th century');
      expect(normalizeText('  Hello   World  ', true)).toBe('Hello World');
    });

    it('normalizes standard IELTS True/False tokens', () => {
      expect(normalizeTFNG('t')).toBe('TRUE');
      expect(normalizeTFNG('f')).toBe('FALSE');
      expect(normalizeTFNG('ng')).toBe('NOT GIVEN');
      expect(normalizeTFNG('  True ')).toBe('TRUE');
    });
  });

  describe('submit', () => {
    it('throws ForbiddenException if actor is not a student', async () => {
      await expect(
        service.submit(
          assignmentId.toHexString(),
          { answers: [{ questionId: 'q-mcq', value: 'A' }] },
          teacherActor,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('grades with exact threshold: exactly 70.0% is PASS, below 70% is NOT PASS', async () => {
      // Setup assignment with 10 questions of 1 point each so we can test precise percentages
      const tenQuestionsSnapshot = {
        title: 'Ten Questions Test',
        type: ExerciseType.READING,
        passScore: 70,
        version: 1,
        questions: Array.from({ length: 10 }, (_, i) => ({
          questionId: `q-${i + 1}`,
          type: QuestionType.MULTIPLE_CHOICE,
          prompt: `Question ${i + 1}`,
          points: 1,
          answerSpecification: { correctKey: 'A' },
        })),
      };

      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...sampleAssignment,
            exerciseSnapshot: tenQuestionsSnapshot,
          }),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleStudentAssignment }),
      });

      submissionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      // 1. Submit 7 correct out of 10 = exactly 70% -> PASS
      const passAnswers = Array.from({ length: 10 }, (_, i) => ({
        questionId: `q-${i + 1}`,
        value: i < 7 ? 'A' : 'B', // 7 correct, 3 wrong
      }));

      const passResult = await service.submit(
        assignmentId.toHexString(),
        { answers: passAnswers },
        studentActor,
      );

      expect(passResult.correctCount).toBe(7);
      expect(passResult.totalQuestions).toBe(10);
      expect(passResult.scorePercent).toBe(70);
      expect(passResult.isPassed).toBe(true);

      // 2. Submit 6 correct out of 10 = 60% -> NOT PASS
      const failAnswers = Array.from({ length: 10 }, (_, i) => ({
        questionId: `q-${i + 1}`,
        value: i < 6 ? 'A' : 'B', // 6 correct, 4 wrong
      }));

      const failResult = await service.submit(
        assignmentId.toHexString(),
        { answers: failAnswers },
        studentActor,
      );

      expect(failResult.correctCount).toBe(6);
      expect(failResult.scorePercent).toBe(60);
      expect(failResult.isPassed).toBe(false);
    });

    it('grades weighted questions and text variants correctly', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sampleAssignment),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleStudentAssignment }),
      });

      submissionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });

      // Answer all 3 questions correctly:
      // q-mcq (1 pt) -> 'a' (case-insensitive)
      // q-tfng (1 pt) -> 't' (normalized to TRUE)
      // q-fib (2 pts) -> '  the  18th century ' (normalized whitespace)
      // Total earned: 4/4 = 100%
      const res = await service.submit(
        assignmentId.toHexString(),
        {
          answers: [
            { questionId: 'q-mcq', value: 'a' },
            { questionId: 'q-tfng', value: 't' },
            { questionId: 'q-fib', value: '  the  18th century ' },
          ],
        },
        studentActor,
      );

      expect(res.correctCount).toBe(3);
      expect(res.scorePercent).toBe(100);
      expect(res.isPassed).toBe(true);
      expect(res.attemptNo).toBe(1);
      // Verify answer key is not leaked in submission response:
      expect(res.feedback[0].answerSpecification).toBeUndefined();
      expect(res.feedback[0].explanation).toBeUndefined();
    });

    it('rejects retake when allowRetake is false and student has already submitted', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            ...sampleAssignment,
            allowRetake: false,
          }),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ ...sampleStudentAssignment }),
      });

      // Existing 1 submission
      submissionModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([{ attemptNo: 1 }]),
        }),
      });

      await expect(
        service.submit(
          assignmentId.toHexString(),
          { answers: [{ questionId: 'q-mcq', value: 'A' }] },
          studentActor,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getAnswerKeys', () => {
    it('locks answer keys and throws ForbiddenException if student has not achieved PASS', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sampleAssignment),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleStudentAssignment,
          status: StudentAssignmentStatus.SUBMITTED,
        }),
      });

      submissionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null), // No passed submission
      });

      await expect(
        service.getAnswerKeys(assignmentId.toHexString(), studentActor),
      ).rejects.toThrow(ForbiddenException);
    });

    it('unlocks full answer keys and explanations when student has achieved PASS', async () => {
      assignmentModel.findById.mockReturnValue({
        select: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue(sampleAssignment),
        }),
      });

      studentAssignmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          ...sampleStudentAssignment,
          status: StudentAssignmentStatus.PASSED,
        }),
      });

      submissionModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ isPassed: true }),
      });

      const res = await service.getAnswerKeys(assignmentId.toHexString(), studentActor);

      expect(res.questions).toHaveLength(3);
      expect(res.questions[0].answerSpecification.correctKey).toBe('A');
      expect(res.questions[0].explanation).toBe('Paragraph 1');
    });
  });
});

