import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ReadingTranslationsService } from './reading-translations.service';
import { TranslationSubmission } from 'src/database/schemas/translation-submission.schema';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { ExamAttempt } from 'src/database/schemas/exam-attempt.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  ExamTestStatus,
  AttemptStatus,
  PartType,
  ExamQuestionType,
  TranslationSubmissionStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('ReadingTranslationsService', () => {
  let service: ReadingTranslationsService;
  let translationModel: any;
  let examTestModel: any;
  let examAttemptModel: any;

  const studentAId = new Types.ObjectId();
  const studentBId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const testId = new Types.ObjectId();
  const passage1Id = new Types.ObjectId();
  const passage2Id = new Types.ObjectId();

  const studentA = {
    _id: studentAId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const studentB = {
    _id: studentBId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacher = {
    _id: teacherId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const sampleReadingTest = {
    _id: testId,
    title: 'Reading Test with 2 Passages',
    skill: ExamSkill.READING,
    status: ExamTestStatus.PUBLISHED,
    passScore: 70,
    version: 1,
    translationEnabled: true,
    parts: [
      {
        _id: passage1Id,
        ordinal: 1,
        type: PartType.PASSAGE,
        title: 'Passage 1',
        contentHtml: '<p>Reading text 1</p>',
        questionGroups: [
          {
            _id: new Types.ObjectId(),
            type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
            questions: [
              { number: 1, prompt: 'Q1', points: 1, grading: { acceptedKeys: ['TRUE'] } },
            ],
          },
        ],
      },
      {
        _id: passage2Id,
        ordinal: 2,
        type: PartType.PASSAGE,
        title: 'Passage 2',
        contentHtml: '<p>Reading text 2</p>',
        questionGroups: [
          {
            _id: new Types.ObjectId(),
            type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
            questions: [
              { number: 2, prompt: 'Q2', points: 1, grading: { acceptedKeys: ['TRUE'] } },
            ],
          },
        ],
      },
    ],
    toObject: () => sampleReadingTest,
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

    translationModel = jest.fn().mockImplementation((dto) => mockDoc(dto));
    translationModel.findById = jest.fn();
    translationModel.findOne = jest.fn();
    translationModel.find = jest.fn();
    translationModel.countDocuments = jest.fn();

    examTestModel = {
      findById: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(sampleReadingTest),
      }),
    };

    examAttemptModel = {
      find: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingTranslationsService,
        { provide: getModelToken(TranslationSubmission.name), useValue: translationModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
        { provide: getModelToken(ExamAttempt.name), useValue: examAttemptModel },
      ],
    }).compile();

    service = module.get<ReadingTranslationsService>(ReadingTranslationsService);
  });

  describe('getEligibility', () => {
    it('returns LOCKED for both passages when student has no passed attempts', async () => {
      examAttemptModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]),
        }),
      });
      translationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.getEligibility(testId.toHexString(), undefined, studentA);
      expect(res.passages[0].unlocked).toBe(false);
      expect(res.passages[0].status).toBe('LOCKED');
      expect(res.passages[1].unlocked).toBe(false);
      expect(res.passages[1].status).toBe('LOCKED');
    });

    it('unlocks ONLY Passage 2 when student passes Passage 2 in PART mode', async () => {
      const passedPartAttempt = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        mode: ExamMode.PART,
        partId: passage2Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['2'],
        savedAnswers: new Map([['2', 'TRUE']]), // 100% PASS
      };

      examAttemptModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([passedPartAttempt]),
        }),
      });
      translationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.getEligibility(testId.toHexString(), undefined, studentA);
      // Passage 1 stays locked
      expect(res.passages[0].unlocked).toBe(false);
      expect(res.passages[0].status).toBe('LOCKED');
      // Passage 2 is unlocked
      expect(res.passages[1].unlocked).toBe(true);
      expect(res.passages[1].status).toBe('DRAFT');
    });

    it('unlocks ALL passages when student passes test in FULL mode', async () => {
      const passedFullAttempt = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        mode: ExamMode.FULL,
        partId: null,
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1', '2'],
        savedAnswers: new Map([
          ['1', 'TRUE'],
          ['2', 'TRUE'],
        ]), // 100% PASS
      };

      examAttemptModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([passedFullAttempt]),
        }),
      });
      translationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const res = await service.getEligibility(testId.toHexString(), undefined, studentA);
      expect(res.passages[0].unlocked).toBe(true);
      expect(res.passages[1].unlocked).toBe(true);
    });
  });

  describe('saveDraft & submitTranslation authorization', () => {
    it('throws 403 TRANSLATION_LOCKED if student attempts to save draft for a locked passage', async () => {
      examAttemptModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([]), // no passed attempt
        }),
      });

      await expect(
        service.saveDraft(
          passage1Id.toHexString(),
          {
            testId: testId.toHexString(),
            textVi: 'Bản dịch lậu',
          },
          studentA,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('successfully saves draft and submits translation when passage is unlocked', async () => {
      const passedPartAttempt = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        mode: ExamMode.PART,
        partId: passage1Id.toHexString(),
        status: AttemptStatus.SUBMITTED,
        scopeQuestionIds: ['1'],
        savedAnswers: new Map([['1', 'TRUE']]),
      };

      examAttemptModel.find.mockReturnValue({
        sort: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue([passedPartAttempt]),
        }),
      });

      translationModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      const draftRes = await service.saveDraft(
        passage1Id.toHexString(),
        {
          testId: testId.toHexString(),
          textVi: 'Bản dịch tiếng Việt hợp lệ',
        },
        studentA,
      );

      expect(draftRes).toBeDefined();
      expect(draftRes.status).toBe('DRAFT');
    });
  });

  describe('teacher review', () => {
    it('allows teacher to review translation and add feedback', async () => {
      const subDoc = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        passageId: passage1Id.toHexString(),
        translatedText: 'Bản dịch học viên',
        status: TranslationSubmissionStatus.SUBMITTED,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      translationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(subDoc),
      });

      const res = await service.reviewTranslation(
        subDoc._id.toHexString(),
        { teacherComment: 'Rất tốt' },
        teacher,
      );

      expect(res.status).toBe('REVIEWED');
      expect(res.teacherComment).toBe('Rất tốt');
    });
  });
});

