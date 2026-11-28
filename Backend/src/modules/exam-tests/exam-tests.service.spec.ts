import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { ExamTestsService } from './exam-tests.service';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  ExamPreset,
  ExamTestStatus,
  PartType,
  ExamQuestionType,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

describe('ExamTestsService', () => {
  let service: ExamTestsService;
  let examTestModel: any;

  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const studentId = new Types.ObjectId();

  const teacherA = {
    _id: teacherAId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const teacherB = {
    _id: teacherBId,
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const student = {
    _id: studentId,
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  beforeEach(async () => {
    function mockDoc(obj: any) {
      return {
        ...obj,
        _id: obj._id || new Types.ObjectId(),
        save: jest.fn().mockResolvedValue(obj),
        toObject: jest.fn().mockReturnValue(obj),
      };
    }

    examTestModel = jest.fn().mockImplementation((dto) => mockDoc(dto));
    examTestModel.findById = jest.fn();
    examTestModel.findByIdAndDelete = jest.fn();
    examTestModel.find = jest.fn();
    examTestModel.countDocuments = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExamTestsService,
        {
          provide: getModelToken(ExamTest.name),
          useValue: examTestModel,
        },
      ],
    }).compile();

    service = module.get<ExamTestsService>(ExamTestsService);
  });

  describe('create', () => {
    it('creates a draft exam test for teacher', async () => {
      const res = await service.create(
        {
          title: 'IELTS Reading 01',
          skill: ExamSkill.READING,
          allowedModes: [ExamMode.PART, ExamMode.FULL],
          passScore: 70,
        },
        teacherA,
      );

      expect(res).toBeDefined();
      expect(res.title).toBe('IELTS Reading 01');
      expect(res.status).toBe(ExamTestStatus.DRAFT);
      expect(res.version).toBe(1);
    });

    it('rejects student from creating exam test with 403', async () => {
      await expect(
        service.create(
          {
            title: 'Hacked Test',
            skill: ExamSkill.READING,
          },
          student,
        ),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('ownership & DRAFT rules', () => {
    it('prevents Teacher B from modifying Teacher A test', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Teacher A Test',
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
        parts: [],
        toObject: () => testDoc,
        save: jest.fn(),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.update(testDoc._id.toHexString(), { title: 'New Title' }, teacherB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects modification if test is PUBLISHED', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Published Test',
        createdBy: teacherAId,
        status: ExamTestStatus.PUBLISHED,
        parts: [],
        toObject: () => testDoc,
        save: jest.fn().mockResolvedValue(true),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.update(testDoc._id.toHexString(), { title: 'New Title' }, teacherA),
      ).rejects.toThrow(BadRequestException);
      expect(testDoc.save).not.toHaveBeenCalled();
    });

    it('rejects addPart, updatePart, deletePart, addQuestionGroup, and updateQuestionGroup on PUBLISHED test', async () => {
      const pId = new Types.ObjectId();
      const gId = new Types.ObjectId();
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Published Test',
        skill: ExamSkill.READING,
        createdBy: teacherAId,
        status: ExamTestStatus.PUBLISHED,
        parts: [
          {
            _id: pId,
            ordinal: 1,
            type: PartType.PASSAGE,
            title: 'Passage 1',
            questionGroups: [{ _id: gId, type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, questions: [] }],
          },
        ],
        toObject: () => testDoc,
        save: jest.fn(),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.addPart(
          testDoc._id.toHexString(),
          { type: PartType.PASSAGE, ordinal: 2, title: 'Passage 2' },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updatePart(testDoc._id.toHexString(), pId.toHexString(), { title: 'Edited' }, teacherA),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.deletePart(testDoc._id.toHexString(), pId.toHexString(), teacherA),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.addQuestionGroup(
          testDoc._id.toHexString(),
          pId.toHexString(),
          {
            type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
            order: 1,
            questions: [
              { number: 1, prompt: 'Q1', type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN, points: 1, grading: { acceptedKeys: ['TRUE'], caseSensitive: false } },
            ],
          },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.updateQuestionGroup(
          testDoc._id.toHexString(),
          gId.toHexString(),
          { title: 'Edited group' },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects modification if test is ARCHIVED', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Archived Test',
        createdBy: teacherAId,
        status: ExamTestStatus.ARCHIVED,
        parts: [],
        toObject: () => testDoc,
        save: jest.fn(),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.update(testDoc._id.toHexString(), { title: 'New Title' }, teacherA),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('addPart & validateTest', () => {
    it('rejects adding SECTION part to a READING test', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Reading Test',
        skill: ExamSkill.READING,
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
        parts: [],
        toObject: () => testDoc,
        save: jest.fn(),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.addPart(
          testDoc._id.toHexString(),
          {
            type: PartType.SECTION,
            ordinal: 1,
            title: 'Section 1',
          },
          teacherA,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('validates test and flags incomplete parts and missing grading', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Incomplete Test',
        skill: ExamSkill.READING,
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
        parts: [
          {
            _id: new Types.ObjectId(),
            ordinal: 1,
            title: 'Passage 1',
            contentHtml: '<p>Reading content</p>',
            questionGroups: [
              {
                _id: new Types.ObjectId(),
                type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
                questions: [
                  {
                    number: 1,
                    prompt: 'Q1',
                    points: 1,
                    grading: { acceptedKeys: [] }, // missing acceptedKeys
                  },
                ],
              },
            ],
          },
        ],
        toObject: () => testDoc,
        save: jest.fn(),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      const validation = await service.validateTest(testDoc._id.toHexString(), teacherA);
      expect(validation.isValid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it('publishes valid test and makes it immutable', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Complete Test',
        skill: ExamSkill.READING,
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
        passScore: 70,
        parts: [
          {
            _id: new Types.ObjectId(),
            ordinal: 1,
            title: 'Passage 1',
            contentHtml: '<p>Complete reading content</p>',
            questionGroups: [
              {
                _id: new Types.ObjectId(),
                type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
                questions: [
                  {
                    number: 1,
                    prompt: 'Q1',
                    points: 1,
                    grading: { acceptedKeys: ['TRUE'] },
                  },
                ],
              },
            ],
          },
        ],
        toObject: () => testDoc,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      const published = await service.publish(testDoc._id.toHexString(), teacherA);
      expect(published).toBeDefined();
      expect(testDoc.status).toBe(ExamTestStatus.PUBLISHED);
    });
  });

  describe('preview', () => {
    it('returns student safe view without grading metadata', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Preview Test',
        skill: ExamSkill.READING,
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
        passScore: 70,
        parts: [
          {
            _id: new Types.ObjectId(),
            ordinal: 1,
            title: 'Passage 1',
            contentHtml: '<p>Content</p>',
            questionGroups: [
              {
                _id: new Types.ObjectId(),
                type: ExamQuestionType.TRUE_FALSE_NOT_GIVEN,
                questions: [
                  {
                    number: 1,
                    prompt: 'Statement 1',
                    points: 1,
                    grading: { acceptedKeys: ['TRUE'] },
                  },
                ],
              },
            ],
          },
        ],
        toObject: () => testDoc,
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      const preview = await service.preview(testDoc._id.toHexString(), teacherA, ExamMode.PART, testDoc.parts[0]._id.toHexString());
      expect(preview).toBeDefined();
      expect((preview as any).questionGroups[0].questions[0]).not.toHaveProperty('grading');
    });
  });

  describe('deleteTest', () => {
    it('deletes test successfully when teacher owns it', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Draft Test To Delete',
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });
      examTestModel.findByIdAndDelete.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      const res = await service.deleteTest(testDoc._id.toHexString(), teacherA);
      expect(res.ok).toBe(true);
      expect(examTestModel.findByIdAndDelete).toHaveBeenCalledWith(testDoc._id.toHexString());
    });

    it('rejects deletion with 403 when teacher does not own the test', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Teacher A Test',
        createdBy: teacherAId,
        status: ExamTestStatus.DRAFT,
      };
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(testDoc),
      });

      await expect(
        service.deleteTest(testDoc._id.toHexString(), teacherB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws 404 if test does not exist', async () => {
      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.deleteTest(new Types.ObjectId().toHexString(), teacherA),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('findAllPublished', () => {
    it('constructs correct query filters for skill, mode, difficulty, and search', async () => {
      const mockQueryChain = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          {
            _id: new Types.ObjectId(),
            title: 'IELTS Academic Reading Test 01',
            subtitle: 'Passage 1',
            skill: ExamSkill.READING,
            difficulty: 'TARGET_65',
            tags: ['Reading', 'Academic'],
            allowedModes: [ExamMode.PART, ExamMode.FULL],
            status: ExamTestStatus.PUBLISHED,
            parts: [],
          },
        ]),
      };
      examTestModel.find.mockReturnValue(mockQueryChain);
      examTestModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(1),
      });

      const res = await service.findAllPublished({
        skill: ExamSkill.READING,
        mode: ExamMode.PART,
        difficulty: 'TARGET_65',
        search: 'Reading',
        page: 1,
        limit: 20,
      });

      expect(res.items).toHaveLength(1);
      expect(res.items[0].difficulty).toBe('TARGET_65');
      expect(examTestModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          $and: expect.arrayContaining([
            { status: ExamTestStatus.PUBLISHED },
            { skill: ExamSkill.READING },
            { allowedModes: ExamMode.PART },
          ]),
        }),
      );
    });
  });

  describe('VOCABULARY & GRAMMAR quiz tests', () => {
    it('allows creating, validating without passage/audio, and editing even after PUBLISHED', async () => {
      const created = await service.create(
        {
          title: 'Academic Vocabulary Quiz 01',
          skill: ExamSkill.VOCABULARY,
          fullDurationSeconds: 600,
        },
        teacherA,
      );

      expect(created.skill).toBe(ExamSkill.VOCABULARY);
      expect(created.allowedModes).toEqual([ExamMode.FULL]);
      expect(created.totalDurationSeconds).toBe(600);

      const publishedQuizDoc: any = {
        _id: new Types.ObjectId(),
        title: 'Published Grammar Quiz',
        skill: ExamSkill.GRAMMAR,
        status: ExamTestStatus.PUBLISHED,
        createdBy: teacherAId,
        parts: [
          {
            _id: new Types.ObjectId(),
            ordinal: 1,
            type: PartType.QUIZ,
            title: 'Grammar Quiz',
            questionGroups: [
              {
                _id: new Types.ObjectId(),
                type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
                order: 1,
                questions: [
                  {
                    number: 1,
                    prompt: 'Choose the right option.',
                    type: ExamQuestionType.MULTIPLE_CHOICE_SINGLE,
                    points: 1,
                    options: [
                      { key: 'A', text: 'opt A' },
                      { key: 'B', text: 'opt B' },
                    ],
                    grading: { acceptedKeys: ['A'] },
                    explanation: 'Because A is grammatically correct.',
                  },
                ],
              },
            ],
          },
        ],
        toObject() {
          return this;
        },
        save: jest.fn().mockImplementation(async function (this: any) {
          return this;
        }),
      };

      examTestModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(publishedQuizDoc),
      });

      const validation = await service.validateTest(publishedQuizDoc._id.toHexString(), teacherA);
      expect(validation.valid).toBe(true);
      expect(validation.totalQuestions).toBe(1);

      const updated = await service.update(
        publishedQuizDoc._id.toHexString(),
        { title: 'Updated Published Grammar Quiz' },
        teacherA,
      );
      expect(updated.title).toBe('Updated Published Grammar Quiz');
      expect(updated.parts[0].questionGroups[0].questions[0].explanation).toBe(
        'Because A is grammatically correct.',
      );
    });
  });
});

