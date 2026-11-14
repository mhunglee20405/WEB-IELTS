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

    it('rejects modification if test is already PUBLISHED', async () => {
      const testDoc = {
        _id: new Types.ObjectId(),
        title: 'Published Test',
        createdBy: teacherAId,
        status: ExamTestStatus.PUBLISHED,
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
});

