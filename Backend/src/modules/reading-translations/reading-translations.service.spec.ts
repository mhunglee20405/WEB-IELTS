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
import { Course } from 'src/database/schemas/course.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { Enrollment } from 'src/database/schemas/enrollment.schema';
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
  let courseModel: any;
  let assignmentModel: any;
  let enrollmentModel: any;

  const studentAId = new Types.ObjectId();
  const studentBId = new Types.ObjectId();
  const teacherId = new Types.ObjectId();
  const otherTeacherId = new Types.ObjectId();
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

  const otherTeacher = {
    _id: otherTeacherId,
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
    createdBy: teacherId,
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
      findOne: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      }),
      find: jest.fn().mockReturnValue({
        exec: jest.fn().mockResolvedValue([sampleReadingTest]),
      }),
    };

    examAttemptModel = {
      find: jest.fn(),
    };

    courseModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findById: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    assignmentModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    enrollmentModel = {
      find: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue([]) }),
      findOne: jest.fn().mockReturnValue({ exec: jest.fn().mockResolvedValue(null) }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReadingTranslationsService,
        { provide: getModelToken(TranslationSubmission.name), useValue: translationModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
        { provide: getModelToken(ExamAttempt.name), useValue: examAttemptModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Enrollment.name), useValue: enrollmentModel },
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

    it('rejects reviewing a DRAFT translation with BadRequestException', async () => {
      const subDoc = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        passageId: passage1Id.toHexString(),
        translatedText: 'Nháp chưa nộp',
        status: TranslationSubmissionStatus.DRAFT,
        save: jest.fn(),
      };

      translationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(subDoc),
      });

      await expect(
        service.reviewTranslation(
          subDoc._id.toHexString(),
          { teacherComment: 'Chưa nộp' },
          teacher,
        ),
      ).rejects.toThrow(
        new BadRequestException('Cannot review a draft translation that has not been submitted'),
      );
    });

    it('rejects teacher who neither owns ExamTest nor teaches a course with an assignment referencing test/student', async () => {
      const subDoc = {
        _id: new Types.ObjectId(),
        studentId: studentAId,
        testId,
        passageId: passage1Id.toHexString(),
        translatedText: 'Bản dịch học viên',
        status: TranslationSubmissionStatus.SUBMITTED,
        save: jest.fn(),
      };

      translationModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue(subDoc),
      });
      courseModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      await expect(
        service.reviewTranslation(
          subDoc._id.toHexString(),
          { teacherComment: 'Unauthorized' },
          otherTeacher,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('allows teacher who owns a course with an assignment referencing that test and enrolled student', async () => {
      const courseId = new Types.ObjectId();
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
      courseModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: courseId, teacherId: otherTeacherId }]),
      });
      assignmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: new Types.ObjectId(), courseId, examTestId: testId }]),
      });
      enrollmentModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: new Types.ObjectId(), courseId, studentId: studentAId }),
      });

      const res = await service.reviewTranslation(
        subDoc._id.toHexString(),
        { teacherComment: 'Duyệt qua khóa học' },
        otherTeacher,
      );

      expect(res.status).toBe('REVIEWED');
    });
  });

  describe('passageId ObjectId validation', () => {
    it('throws NotFoundException instead of CastError when passageId is invalid in getPassageTranslation, saveDraft, submitTranslation', async () => {
      await expect(
        service.getPassageTranslation('invalid-passage-id', undefined, undefined, studentA),
      ).rejects.toThrow(new NotFoundException('Passage not found'));

      await expect(
        service.saveDraft('invalid-passage-id', { textVi: 'test' }, studentA),
      ).rejects.toThrow(new NotFoundException('Passage not found'));

      await expect(
        service.submitTranslation('invalid-passage-id', { textVi: 'test' }, studentA),
      ).rejects.toThrow(new NotFoundException('Passage not found'));

      expect(examTestModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('findAllForTeacher', () => {
    function setupTranslationFindMock(docs: any[] = []) {
      translationModel.find.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            sort: jest.fn().mockReturnValue({
              skip: jest.fn().mockReturnValue({
                limit: jest.fn().mockReturnValue({
                  exec: jest.fn().mockResolvedValue(docs),
                }),
              }),
            }),
          }),
        }),
      });
      translationModel.countDocuments.mockReturnValue({
        exec: jest.fn().mockResolvedValue(docs.length),
      });
    }

    it('preserves query.testId filter from DRIFT-04 and restricts teacher to owned/assigned tests', async () => {
      setupTranslationFindMock([]);
      examTestModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ _id: testId }]),
      });

      const res = await service.findAllForTeacher({ testId: testId.toHexString() }, teacher);

      expect(res.items).toEqual([]);
      expect(translationModel.find).toHaveBeenCalledWith(
        expect.objectContaining({
          testId,
        }),
      );
      const filterArg = translationModel.find.mock.calls[0][0];
      expect(filterArg.$or).toBeDefined();
    });

    it('returns empty without querying translations if teacher owns no tests and no courses/assignments', async () => {
      examTestModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });
      courseModel.find.mockReturnValue({ exec: jest.fn().mockResolvedValue([]) });

      const res = await service.findAllForTeacher({}, teacher);

      expect(res).toEqual({ items: [], total: 0, page: 1, limit: 20, totalPages: 1 });
      expect(translationModel.find).not.toHaveBeenCalled();
    });

    it('rejects invalid courseId and rejects teacher querying unowned courseId', async () => {
      await expect(
        service.findAllForTeacher({ courseId: 'not-valid' }, teacher),
      ).rejects.toThrow(BadRequestException);

      const unownedCourseId = new Types.ObjectId();
      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: unownedCourseId, teacherId: otherTeacherId }),
      });

      await expect(
        service.findAllForTeacher({ courseId: unownedCourseId.toHexString() }, teacher),
      ).rejects.toThrow(ForbiddenException);
    });

    it('scopes query.courseId by assignments and enrolled students in that course', async () => {
      const courseId = new Types.ObjectId();
      const courseAssignmentId = new Types.ObjectId();
      setupTranslationFindMock([]);

      courseModel.findById.mockReturnValue({
        exec: jest.fn().mockResolvedValue({ _id: courseId, teacherId }),
      });
      assignmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([
          { _id: courseAssignmentId, courseId, examTestId: testId },
        ]),
      });
      enrollmentModel.find.mockReturnValue({
        exec: jest.fn().mockResolvedValue([{ courseId, studentId: studentAId }]),
      });

      await service.findAllForTeacher({ courseId: courseId.toHexString() }, teacher);

      expect(translationModel.find).toHaveBeenCalledTimes(1);
      const filterArg = translationModel.find.mock.calls[0][0];
      expect(JSON.stringify(filterArg)).toContain(courseAssignmentId.toHexString());
      expect(JSON.stringify(filterArg)).toContain(testId.toHexString());
      expect(JSON.stringify(filterArg)).toContain(studentAId.toHexString());
    });
  });
});

