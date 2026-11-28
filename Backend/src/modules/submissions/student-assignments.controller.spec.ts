import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { StudentAssignmentsController } from './student-assignments.controller';
import { SubmissionsService } from './submissions.service';
import { TranslationsService } from 'src/modules/translations/translations.service';
import { ExtensionsService } from 'src/modules/extensions/extensions.service';
import { StudentAssignment } from 'src/database/schemas/student-assignment.schema';
import { Assignment } from 'src/database/schemas/assignment.schema';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import { PassageVocab } from 'src/database/schemas/passage-vocab.schema';
import { Submission } from 'src/database/schemas/submission.schema';
import { TranslationSubmission } from 'src/database/schemas/translation-submission.schema';
import { Course } from 'src/database/schemas/course.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  StudentAssignmentStatus,
  TranslationSubmissionStatus,
  UserRole,
  UserStatus,
} from 'src/database/schemas/enums';

function createChainableQuery(resolvedValue: any) {
  const query: any = {
    populate: jest.fn().mockImplementation(() => query),
    select: jest.fn().mockImplementation(() => query),
    sort: jest.fn().mockImplementation(() => query),
    lean: jest.fn().mockImplementation(() => query),
    exec: jest.fn().mockResolvedValue(resolvedValue),
  };
  return query;
}

describe('StudentAssignmentsController', () => {
  let controller: StudentAssignmentsController;
  let studentAssignmentModel: any;
  let assignmentModel: any;
  let submissionModel: any;
  let translationModel: any;
  let courseModel: any;
  let examTestModel: any;
  let passageVocabModel: any;
  let submissionsService: any;
  let translationsService: any;
  let extensionsService: any;

  const studentAId = new Types.ObjectId();
  const studentBId = new Types.ObjectId();
  const teacherAId = new Types.ObjectId();
  const teacherBId = new Types.ObjectId();
  const adminId = new Types.ObjectId();
  const courseId = new Types.ObjectId();
  const assignmentId = new Types.ObjectId();
  const saId = new Types.ObjectId();

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

  const adminActor = {
    _id: adminId,
    role: UserRole.ADMIN,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const pastOpenAt = new Date(Date.now() - 60 * 60 * 1000);
  const futureOpenAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const futureDeadlineAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

  const sampleAssignment = {
    _id: assignmentId,
    courseId,
    title: 'Reading Passage 1',
    openAt: pastOpenAt,
    deadlineAt: futureDeadlineAt,
    targetScorePercent: 70,
    exerciseSnapshot: {
      title: 'Glass History',
      type: 'reading',
      passage: '<p>Secret passage content</p>',
      questions: [
        {
          questionId: 'q1',
          orderIndex: 1,
          prompt: 'Question 1',
          type: 'true_false_not_given',
          points: 1,
          answerSpecification: { correctKey: 'TRUE' },
          explanation: 'Line 1',
        },
      ],
    },
  };

  beforeEach(async () => {
    function MockTranslationInstance(dto: any) {
      Object.assign(this, dto);
      this._id = new Types.ObjectId();
      this.save = jest.fn().mockResolvedValue(this);
    }

    translationModel = MockTranslationInstance;
    translationModel.findOne = jest.fn().mockReturnValue(createChainableQuery(null));

    studentAssignmentModel = {
      findById: jest.fn(),
    };

    assignmentModel = {
      findById: jest.fn().mockReturnValue(createChainableQuery(sampleAssignment)),
    };

    submissionModel = {
      countDocuments: jest.fn().mockReturnValue(createChainableQuery(1)),
      find: jest.fn().mockReturnValue(createChainableQuery([])),
      findOne: jest.fn().mockReturnValue(createChainableQuery(null)),
    };

    courseModel = {
      findById: jest.fn().mockReturnValue(
        createChainableQuery({ _id: courseId, teacherId: teacherAId }),
      ),
    };

    examTestModel = {
      findById: jest.fn().mockReturnValue(createChainableQuery(null)),
    };

    passageVocabModel = {
      find: jest.fn().mockReturnValue(createChainableQuery([])),
    };

    submissionsService = {
      submit: jest.fn(),
    };

    translationsService = {
      submit: jest.fn().mockResolvedValue({
        id: new Types.ObjectId(),
        status: TranslationSubmissionStatus.SUBMITTED,
        submittedAt: new Date(),
      }),
    };

    extensionsService = {
      create: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [StudentAssignmentsController],
      providers: [
        { provide: getModelToken(StudentAssignment.name), useValue: studentAssignmentModel },
        { provide: getModelToken(Assignment.name), useValue: assignmentModel },
        { provide: getModelToken(Submission.name), useValue: submissionModel },
        { provide: getModelToken(TranslationSubmission.name), useValue: translationModel },
        { provide: getModelToken(Course.name), useValue: courseModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
        { provide: getModelToken(PassageVocab.name), useValue: passageVocabModel },
        { provide: SubmissionsService, useValue: submissionsService },
        { provide: TranslationsService, useValue: translationsService },
        { provide: ExtensionsService, useValue: extensionsService },
      ],
    }).compile();

    controller = module.get<StudentAssignmentsController>(StudentAssignmentsController);
  });

  describe('GET /:id/submissions (listSubmissions)', () => {
    it('blocks another student from viewing submissions (IDOR)', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(controller.listSubmissions(saId.toHexString(), studentB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a teacher who does not own the course', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(controller.listSubmissions(saId.toHexString(), teacherB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows owning student, course teacher, and admin', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(controller.listSubmissions(saId.toHexString(), studentA)).resolves.toEqual([]);
      await expect(controller.listSubmissions(saId.toHexString(), teacherA)).resolves.toEqual([]);
      await expect(controller.listSubmissions(saId.toHexString(), adminActor)).resolves.toEqual([]);
    });
  });

  describe('GET /:id (getDetail)', () => {
    it('blocks another student and unowned teacher (IDOR)', async () => {
      const saDoc = {
        _id: saId,
        studentId: { _id: studentAId, fullName: 'Student A', email: 'a@test.com' },
        assignmentId: {
          ...sampleAssignment,
          courseId: { _id: courseId, code: 'C1', title: 'Course 1', teacherId: teacherAId },
        },
        effectiveDeadlineAt: futureDeadlineAt,
        status: StudentAssignmentStatus.SUBMITTED,
      };
      studentAssignmentModel.findById.mockReturnValue(createChainableQuery(saDoc));

      await expect(controller.getDetail(saId.toHexString(), studentB)).rejects.toThrow(
        ForbiddenException,
      );
      await expect(controller.getDetail(saId.toHexString(), teacherB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('uses assignment.targetScorePercent instead of hardcoded 70 and computes penaltyApplied from penaltyAppliedAt', async () => {
      const saDoc = {
        _id: saId,
        studentId: { _id: studentAId, fullName: 'Student A', email: 'a@test.com' },
        assignmentId: {
          ...sampleAssignment,
          targetScorePercent: 80,
          courseId: { _id: courseId, code: 'C1', title: 'Course 1', teacherId: teacherAId },
        },
        effectiveDeadlineAt: futureDeadlineAt,
        status: StudentAssignmentStatus.SUBMITTED,
        bestScore: 75,
        isTargetAchieved: false,
        penaltyAppliedAt: new Date('2026-11-20T00:00:00Z'),
      };
      studentAssignmentModel.findById.mockReturnValue(createChainableQuery(saDoc));

      const detail = await controller.getDetail(saId.toHexString(), studentA);

      expect(detail.passed).toBe(false);
      expect(detail.answerReviewUnlocked).toBe(false);
      expect(detail.status).toBe(StudentAssignmentStatus.SUBMITTED);
      expect(detail.penaltyApplied).toBe(true);
    });

    it('treats bestScore >= targetScorePercent (< 70) as passed and penaltyApplied=false when penaltyAppliedAt missing', async () => {
      const saDoc = {
        _id: saId,
        studentId: { _id: studentAId, fullName: 'Student A', email: 'a@test.com' },
        assignmentId: {
          ...sampleAssignment,
          targetScorePercent: 60,
          courseId: { _id: courseId, code: 'C1', title: 'Course 1', teacherId: teacherAId },
        },
        effectiveDeadlineAt: futureDeadlineAt,
        status: StudentAssignmentStatus.SUBMITTED,
        bestScore: 65,
        isTargetAchieved: false,
      };
      studentAssignmentModel.findById.mockReturnValue(createChainableQuery(saDoc));

      const detail = await controller.getDetail(saId.toHexString(), studentA);

      expect(detail.passed).toBe(true);
      expect(detail.status).toBe(StudentAssignmentStatus.PASSED);
      expect(detail.penaltyApplied).toBe(false);
    });
  });

  describe('GET /:id/review (getReview)', () => {
    it('rejects student review when bestScore < custom targetScorePercent (80)', async () => {
      const assignment80 = { ...sampleAssignment, targetScorePercent: 80 };
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({
          _id: saId,
          studentId: studentAId,
          assignmentId: assignment80,
          status: StudentAssignmentStatus.SUBMITTED,
          bestScore: 75,
          isTargetAchieved: false,
        }),
      );
      assignmentModel.findById.mockReturnValue(createChainableQuery(assignment80));

      await expect(controller.getReview(saId.toHexString(), studentA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows student review when bestScore >= custom targetScorePercent (60)', async () => {
      const assignment60 = { ...sampleAssignment, targetScorePercent: 60 };
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({
          _id: saId,
          studentId: studentAId,
          assignmentId: assignment60,
          status: StudentAssignmentStatus.SUBMITTED,
          bestScore: 65,
          isTargetAchieved: false,
        }),
      );
      assignmentModel.findById.mockReturnValue(createChainableQuery(assignment60));

      const res = await controller.getReview(saId.toHexString(), studentA);
      expect(res.passed).toBe(true);
    });

    it('blocks a teacher who does not own the course', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({
          _id: saId,
          studentId: studentAId,
          assignmentId: sampleAssignment,
          status: StudentAssignmentStatus.PASSED,
          bestScore: 90,
        }),
      );

      await expect(controller.getReview(saId.toHexString(), teacherB)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('GET /:id/translation (getTranslation)', () => {
    it('blocks another student (IDOR)', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(controller.getTranslation(saId.toHexString(), studentB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks a teacher who does not own the course', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(controller.getTranslation(saId.toHexString(), teacherB)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('blocks student before openAt so passageHtml is not leaked', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      assignmentModel.findById.mockReturnValue(
        createChainableQuery({ ...sampleAssignment, openAt: futureOpenAt }),
      );

      await expect(controller.getTranslation(saId.toHexString(), studentA)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('allows course teacher even before openAt', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      assignmentModel.findById.mockReturnValue(
        createChainableQuery({ ...sampleAssignment, openAt: futureOpenAt }),
      );

      const res = await controller.getTranslation(saId.toHexString(), teacherA);
      expect(res.passageHtml).toContain('Secret passage content');
    });
  });

  describe('PUT /:id/translation/draft (saveTranslationDraft)', () => {
    it('blocks another student (IDOR)', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(
        controller.saveTranslationDraft(saId.toHexString(), { translatedText: 'hack' }, studentB),
      ).rejects.toThrow(ForbiddenException);
    });

    it('blocks student before openAt', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      assignmentModel.findById.mockReturnValue(
        createChainableQuery({ ...sampleAssignment, openAt: futureOpenAt }),
      );

      await expect(
        controller.saveTranslationDraft(saId.toHexString(), { translatedText: 'early' }, studentA),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when existing translation is SUBMITTED', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      translationModel.findOne.mockReturnValue(
        createChainableQuery({
          _id: new Types.ObjectId(),
          status: TranslationSubmissionStatus.SUBMITTED,
          translatedText: 'Submitted text',
          save: jest.fn(),
        }),
      );

      await expect(
        controller.saveTranslationDraft(saId.toHexString(), { translatedText: 'overwrite' }, studentA),
      ).rejects.toThrow(new BadRequestException('Cannot edit a submitted or reviewed translation'));
    });

    it('throws BadRequestException when existing translation is REVIEWED', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      translationModel.findOne.mockReturnValue(
        createChainableQuery({
          _id: new Types.ObjectId(),
          status: TranslationSubmissionStatus.REVIEWED,
          translatedText: 'Reviewed text',
          save: jest.fn(),
        }),
      );

      await expect(
        controller.saveTranslationDraft(saId.toHexString(), { translatedText: 'overwrite' }, studentA),
      ).rejects.toThrow(new BadRequestException('Cannot edit a submitted or reviewed translation'));
    });

    it('allows saving draft when existing translation is DRAFT and after openAt', async () => {
      const existingDraft = {
        _id: new Types.ObjectId(),
        status: TranslationSubmissionStatus.DRAFT,
        translatedText: 'Old draft',
        save: jest.fn().mockResolvedValue(true),
      };
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      translationModel.findOne.mockReturnValue(createChainableQuery(existingDraft));

      const res = await controller.saveTranslationDraft(
        saId.toHexString(),
        { translatedText: 'Updated draft' },
        studentA,
      );

      expect(existingDraft.save).toHaveBeenCalled();
      expect(res.draftText).toBe('Updated draft');
    });
  });

  describe('POST /:id/translation/submit (submitTranslation)', () => {
    it('blocks another student (IDOR)', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );

      await expect(
        controller.submitTranslation(saId.toHexString(), { translatedText: 'hack' }, studentB),
      ).rejects.toThrow(ForbiddenException);
      expect(translationsService.submit).not.toHaveBeenCalled();
    });

    it('blocks student before openAt with ForbiddenException', async () => {
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({ _id: saId, studentId: studentAId, assignmentId }),
      );
      assignmentModel.findById.mockReturnValue(
        createChainableQuery({ ...sampleAssignment, openAt: futureOpenAt }),
      );

      await expect(
        controller.submitTranslation(saId.toHexString(), { translatedText: 'early' }, studentA),
      ).rejects.toThrow(ForbiddenException);
      expect(translationsService.submit).not.toHaveBeenCalled();
    });
  });

  describe('Contextual Vocabulary & ExamTest Metadata Sync', () => {
    it('resolves examTestId, passageId, passages, and passageVocabs on getDetail/getReview/getTranslation when unlocked and hides before openAt', async () => {
      const testId = new Types.ObjectId();
      const part1Id = new Types.ObjectId();
      const part2Id = new Types.ObjectId();
      const vocab1Id = new Types.ObjectId();

      const examTestDoc = {
        _id: testId,
        title: 'Academic Reading Test 1',
        skill: 'READING',
        parts: [
          { _id: part1Id, ordinal: 1, title: 'Passage 1', contentHtml: '<p>Vertical farming text</p>' },
          { _id: part2Id, ordinal: 2, title: 'Passage 2', contentHtml: '<p>Other passage</p>' },
        ],
      };
      examTestModel.findById.mockReturnValue(createChainableQuery(examTestDoc));
      passageVocabModel.find.mockReturnValue(
        createChainableQuery([
          {
            _id: vocab1Id,
            passageId: part1Id.toHexString(),
            testId,
            partNumber: 1,
            word: 'aeroponic',
            partOfSpeech: 'adj',
            meaningVi: 'khí canh',
            order: 0,
          },
        ]),
      );

      const v2Assignment = {
        ...sampleAssignment,
        examTestId: testId,
        exerciseId: testId,
        requiredScope: 'PART',
        requiredPartId: part1Id.toHexString(),
        allowRetake: true,
        strictExamMode: false,
      };

      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({
          _id: saId,
          studentId: { _id: studentAId, fullName: 'Student A', email: 'a@test.com' },
          assignmentId: {
            ...v2Assignment,
            courseId: { _id: courseId, code: 'C1', title: 'Course 1', teacherId: teacherAId },
          },
          effectiveDeadlineAt: futureDeadlineAt,
          status: StudentAssignmentStatus.PASSED,
          isTargetAchieved: true,
          bestScore: 90,
        }),
      );
      assignmentModel.findById.mockReturnValue(createChainableQuery(v2Assignment));

      const detail: any = await controller.getDetail(saId.toHexString(), studentA);
      expect(detail.examTestId).toBe(testId.toHexString());
      expect(detail.passageId).toBe(part1Id.toHexString());
      expect(detail.strictExamMode).toBe(false);
      expect(detail.passages).toHaveLength(1);
      expect(detail.passageVocabs).toHaveLength(1);
      expect(detail.passageVocabs[0].word).toBe('aeroponic');

      const review: any = await controller.getReview(saId.toHexString(), studentA);
      expect(review.testId).toBe(testId.toHexString());
      expect(review.passageId).toBe(part1Id.toHexString());
      expect(review.passages).toHaveLength(1);
      expect(review.passageVocabs[0].word).toBe('aeroponic');

      const trans: any = await controller.getTranslation(saId.toHexString(), studentA);
      expect(trans.testId).toBe(testId.toHexString());
      expect(trans.passageId).toBe(part1Id.toHexString());
      expect(trans.passageVocabs[0].word).toBe('aeroponic');

      // Ensure locked pre-openAt assignment hides passages and passageVocabs
      studentAssignmentModel.findById.mockReturnValue(
        createChainableQuery({
          _id: saId,
          studentId: { _id: studentAId, fullName: 'Student A', email: 'a@test.com' },
          assignmentId: {
            ...v2Assignment,
            openAt: futureOpenAt,
            courseId: { _id: courseId, code: 'C1', title: 'Course 1', teacherId: teacherAId },
          },
          effectiveDeadlineAt: futureDeadlineAt,
          status: StudentAssignmentStatus.NOT_STARTED,
        }),
      );
      const lockedDetail: any = await controller.getDetail(saId.toHexString(), studentA);
      expect(lockedDetail.exercise.isLocked).toBe(true);
      expect(lockedDetail.passages).toBeUndefined();
      expect(lockedDetail.passageVocabs).toBeUndefined();
    });
  });
});
