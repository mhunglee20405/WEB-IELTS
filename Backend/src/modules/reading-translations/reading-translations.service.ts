import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  TranslationSubmission,
  TranslationSubmissionDocument,
} from 'src/database/schemas/translation-submission.schema';
import {
  ExamTest,
  ExamTestDocument,
} from 'src/database/schemas/exam-test.schema';
import {
  ExamAttempt,
  ExamAttemptDocument,
} from 'src/database/schemas/exam-attempt.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  AttemptStatus,
  TranslationSubmissionStatus,
  UserRole,
} from 'src/database/schemas/enums';
import {
  SaveTranslationDraftDto,
  SubmitReadingTranslationDto,
  ReviewReadingTranslationDto,
  TeacherTranslationQueryDto,
} from './dto/reading-translation.dto';
import { extractObjectId } from 'src/modules/exam-tests/mappers/exam-test.mapper';
import { gradeQuestion } from 'src/common/utils/exam-grading.util';

@Injectable()
export class ReadingTranslationsService {
  constructor(
    @InjectModel(TranslationSubmission.name)
    private translationModel: Model<TranslationSubmissionDocument>,
    @InjectModel(ExamTest.name)
    private examTestModel: Model<ExamTestDocument>,
    @InjectModel(ExamAttempt.name)
    private examAttemptModel: Model<ExamAttemptDocument>,
  ) {}

  /**
   * Evaluates whether a student has passed an attempt covering a given passage.
   */
  async checkPassageUnlockStatus(
    studentId: Types.ObjectId,
    test: ExamTestDocument,
    passageId: string,
  ): Promise<{ unlocked: boolean; sourceAttemptId: string | null }> {
    // Find all submitted attempts for this student and test
    const attempts = await this.examAttemptModel
      .find({
        studentId,
        testId: test._id,
        status: { $in: [AttemptStatus.SUBMITTED, AttemptStatus.AUTO_SUBMITTED] },
      })
      .sort({ submittedAt: -1 })
      .exec();

    // Map questions in test
    const questionMap = new Map<string, any>();
    for (const part of test.parts || []) {
      for (const group of part.questionGroups || []) {
        for (const q of group.questions || []) {
          questionMap.set(q.number.toString(), {
            type: q.type || group.type,
            points: q.points ?? 1,
            grading: q.grading,
          });
        }
      }
    }

    for (const att of attempts) {
      // Check if attempt covers this passage
      const isFull = att.mode === ExamMode.FULL;
      const isTargetPart = att.mode === ExamMode.PART && att.partId === passageId;

      if (!isFull && !isTargetPart) {
        continue;
      }

      // Check if this attempt passed (>= 70%)
      const studentAnswers = att.savedAnswers instanceof Map
        ? att.savedAnswers
        : new Map(Object.entries(att.savedAnswers || {}));

      let earned = 0;
      let total = 0;

      for (const qNum of att.scopeQuestionIds) {
        const q = questionMap.get(qNum);
        const qPoints = q?.points ?? 1;
        total += qPoints;

        const val = studentAnswers.get(qNum);
        const res = gradeQuestion(q?.type, val, q?.grading, qPoints);
        if (res.isCorrect) {
          earned += res.awardedPoints;
        }
      }

      const scorePercent = total > 0 ? (earned / total) * 100 : 0;
      const passScore = test.passScore ?? 70;

      if (scorePercent >= passScore) {
        return {
          unlocked: true,
          sourceAttemptId: extractObjectId(att._id),
        };
      }
    }

    return { unlocked: false, sourceAttemptId: null };
  }

  async getEligibility(testId: string, studentAssignmentId: string | undefined, student: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }

    if (test.skill !== ExamSkill.READING) {
      throw new BadRequestException('Translation features are only available for Reading tests');
    }

    const passageStatuses: any[] = [];

    for (const part of test.parts || []) {
      const partId = extractObjectId((part as any)._id);
      const unlockInfo = await this.checkPassageUnlockStatus(student._id as Types.ObjectId, test, partId);

      // Check if there is an existing translation submission
      const existingFilter: Record<string, any> = {
        studentId: student._id,
        testId: test._id,
        passageId: partId,
      };

      const existingSub = await this.translationModel.findOne(existingFilter).exec();

      let status = 'LOCKED';
      if (unlockInfo.unlocked) {
        status = existingSub ? existingSub.status.toUpperCase() : 'DRAFT';
      }

      passageStatuses.push({
        passageId: partId,
        ordinal: part.ordinal,
        partNumber: part.ordinal,
        title: part.title,
        passageTitle: part.title,
        unlocked: unlockInfo.unlocked,
        eligible: unlockInfo.unlocked,
        sourceAttemptId: unlockInfo.sourceAttemptId,
        unlockedByAttemptId: unlockInfo.sourceAttemptId,
        status,
        lockReason: unlockInfo.unlocked ? null : 'Cần đạt từ 70% trở lên cho Passage này để mở khóa dịch.',
        hasSubmission: Boolean(existingSub),
        submissionStatus: existingSub?.status || null,
        updatedAt: existingSub?.updatedAt ? existingSub.updatedAt.toISOString() : null,
        submittedAt: existingSub?.submittedAt ? existingSub.submittedAt.toISOString() : null,
        reviewedAt: existingSub?.reviewedAt ? existingSub.reviewedAt.toISOString() : null,
      });
    }

    const fullTestPassed = (passageStatuses.length > 0 && passageStatuses.every((p) => p.unlocked)) || false;

    return {
      testId: extractObjectId(test._id),
      testTitle: test.title,
      exerciseVersion: test.version,
      translationEnabled: test.translationEnabled,
      passThresholdPercent: test.passScore ?? 70,
      fullTestPassed,
      passages: passageStatuses,
    };
  }

  async getPassageTranslation(
    passageId: string,
    testId: string | undefined,
    studentAssignmentId: string | undefined,
    student: UserDocument,
  ) {
    let test: ExamTestDocument | null = null;
    if (testId && Types.ObjectId.isValid(testId)) {
      test = await this.examTestModel.findById(testId).exec();
    }
    if (!test) {
      test = await this.examTestModel.findOne({ 'parts._id': passageId }).exec();
    }
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }

    const part = (test.parts || []).find((p: any) => extractObjectId(p._id) === passageId);
    if (!part) {
      throw new NotFoundException('Passage not found in this test');
    }

    const unlockInfo = await this.checkPassageUnlockStatus(student._id as Types.ObjectId, test, passageId);

    const existing = await this.translationModel
      .findOne({
        studentId: student._id,
        testId: test._id,
        passageId,
      })
      .exec();

    const id = existing ? extractObjectId(existing._id) : undefined;
    const status = unlockInfo.unlocked ? (existing ? existing.status.toUpperCase() : 'DRAFT') : 'LOCKED';

    return {
      id,
      testId: extractObjectId(test._id),
      testTitle: test.title,
      passageId,
      partNumber: part.ordinal,
      ordinal: part.ordinal,
      passageTitle: part.title,
      title: part.title,
      passageHtml: part.contentHtml || '',
      sourceContentHtml: part.contentHtml || '',
      unlocked: unlockInfo.unlocked,
      status,
      revision: (existing as any)?.version || (existing as any)?.__v || 1,
      textVi: existing?.translatedText || '',
      translatedText: existing?.translatedText || '',
      teacherFeedback: existing?.teacherComment || null,
      teacherComment: existing?.teacherComment || null,
      reviewedBy: existing?.reviewedBy ? extractObjectId(existing.reviewedBy) : null,
      reviewedAt: existing?.reviewedAt ? existing.reviewedAt.toISOString() : null,
      updatedAt: existing?.updatedAt ? existing.updatedAt.toISOString() : null,
      submittedAt: existing?.submittedAt ? existing.submittedAt.toISOString() : null,
      studentAssignmentId: studentAssignmentId || null,
    };
  }

  async saveDraft(passageId: string, dto: SaveTranslationDraftDto, student: UserDocument) {
    let test: ExamTestDocument | null = null;
    if (dto.testId && Types.ObjectId.isValid(dto.testId)) {
      test = await this.examTestModel.findById(dto.testId).exec();
    }
    if (!test) {
      test = await this.examTestModel.findOne({ 'parts._id': passageId }).exec();
    }
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }

    const part = (test.parts || []).find((p: any) => extractObjectId(p._id) === passageId);
    if (!part) {
      throw new NotFoundException('Passage not found in this test');
    }

    // STRICT UNLOCK CHECK: Student must have a passed attempt covering this passage
    const unlockInfo = await this.checkPassageUnlockStatus(student._id as Types.ObjectId, test, passageId);
    if (!unlockInfo.unlocked) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'TRANSLATION_LOCKED',
        message: 'Passage chưa được mở khóa vì chưa có attempt PASS hợp lệ.',
      });
    }

    const filter: Record<string, any> = {
      studentId: student._id,
      testId: test._id,
      passageId,
    };

    let sub = await this.translationModel.findOne(filter).exec();

    if (sub) {
      if (sub.status === TranslationSubmissionStatus.REVIEWED) {
        throw new BadRequestException('Cannot edit a translation that has already been reviewed');
      }
      sub.translatedText = dto.textVi;
      sub.status = TranslationSubmissionStatus.DRAFT;
      await sub.save();
    } else {
      sub = new this.translationModel({
        studentId: student._id,
        testId: test._id,
        passageId,
        exerciseVersion: dto.exerciseVersion || test.version,
        studentAssignmentId: dto.studentAssignmentId && Types.ObjectId.isValid(dto.studentAssignmentId)
          ? new Types.ObjectId(dto.studentAssignmentId)
          : undefined,
        sourceAttemptId: unlockInfo.sourceAttemptId ? new Types.ObjectId(unlockInfo.sourceAttemptId) : undefined,
        translatedText: dto.textVi,
        status: TranslationSubmissionStatus.DRAFT,
      });
      await sub.save();
    }

    const id = extractObjectId(sub._id);
    return {
      id,
      passageId,
      status: sub.status.toUpperCase(),
      textVi: sub.translatedText,
      translatedText: sub.translatedText,
      updatedAt: sub.updatedAt ? sub.updatedAt.toISOString() : new Date().toISOString(),
      revision: (sub as any).version || (sub as any).__v || 1,
    };
  }

  async submitTranslation(passageId: string, dto: SubmitReadingTranslationDto, student: UserDocument) {
    let test: ExamTestDocument | null = null;
    if (dto.testId && Types.ObjectId.isValid(dto.testId)) {
      test = await this.examTestModel.findById(dto.testId).exec();
    }
    if (!test) {
      test = await this.examTestModel.findOne({ 'parts._id': passageId }).exec();
    }
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }

    const part = (test.parts || []).find((p: any) => extractObjectId(p._id) === passageId);
    if (!part) {
      throw new NotFoundException('Passage not found in this test');
    }

    // STRICT UNLOCK CHECK: Student must have a passed attempt covering this passage
    const unlockInfo = await this.checkPassageUnlockStatus(student._id as Types.ObjectId, test, passageId);
    if (!unlockInfo.unlocked) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'TRANSLATION_LOCKED',
        message: 'Passage chưa được mở khóa vì chưa có attempt PASS hợp lệ.',
      });
    }

    const filter: Record<string, any> = {
      studentId: student._id,
      testId: test._id,
      passageId,
    };

    let sub = await this.translationModel.findOne(filter).exec();

    const submittedAt = new Date();

    if (sub) {
      if (sub.status === TranslationSubmissionStatus.REVIEWED) {
        throw new BadRequestException('Cannot edit a translation that has already been reviewed');
      }
      if (dto.textVi !== undefined) {
        sub.translatedText = dto.textVi;
      }
      sub.status = TranslationSubmissionStatus.SUBMITTED;
      sub.submittedAt = submittedAt;
      await sub.save();
    } else {
      if (!dto.textVi) {
        throw new BadRequestException('translatedText is required when submitting a translation');
      }
      sub = new this.translationModel({
        studentId: student._id,
        testId: test._id,
        passageId,
        exerciseVersion: dto.exerciseVersion || test.version,
        studentAssignmentId: dto.studentAssignmentId && Types.ObjectId.isValid(dto.studentAssignmentId)
          ? new Types.ObjectId(dto.studentAssignmentId)
          : undefined,
        sourceAttemptId: unlockInfo.sourceAttemptId ? new Types.ObjectId(unlockInfo.sourceAttemptId) : undefined,
        translatedText: dto.textVi,
        status: TranslationSubmissionStatus.SUBMITTED,
        submittedAt,
      });
      await sub.save();
    }

    const id = extractObjectId(sub._id);
    return {
      id,
      passageId,
      status: sub.status.toUpperCase(),
      textVi: sub.translatedText,
      translatedText: sub.translatedText,
      submittedAt: sub.submittedAt ? sub.submittedAt.toISOString() : new Date().toISOString(),
      revision: (sub as any).version || (sub as any).__v || 1,
    };
  }

  async findAllForTeacher(query: TeacherTranslationQueryDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot view translation submissions list');
    }

    const filter: Record<string, any> = {};
    if (query.status) {
      filter.status = query.status.toLowerCase();
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [docs, total] = await Promise.all([
      this.translationModel
        .find(filter)
        .populate('studentId', 'fullName email')
        .populate('testId', 'title')
        .sort({ submittedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.translationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d: any) => ({
        id: extractObjectId(d._id),
        translationId: extractObjectId(d._id),
        studentId: d.studentId ? extractObjectId(d.studentId._id || d.studentId) : null,
        studentName: d.studentId?.fullName || null,
        studentEmail: d.studentId?.email || null,
        testId: d.testId ? extractObjectId(d.testId._id || d.testId) : null,
        testTitle: d.testId?.title || null,
        passageId: d.passageId || null,
        status: (d.status || '').toUpperCase(),
        textVi: d.translatedText,
        translatedText: d.translatedText,
        submittedAt: d.submittedAt,
        teacherFeedback: d.teacherComment,
        teacherComment: d.teacherComment,
        reviewedAt: d.reviewedAt,
      })),
      total,
      page,
      limit,
    };
  }

  async reviewTranslation(translationId: string, dto: ReviewReadingTranslationDto, teacher: UserDocument) {
    if (teacher.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot review translations');
    }

    if (!Types.ObjectId.isValid(translationId)) {
      throw new NotFoundException('Translation submission not found');
    }

    const sub = await this.translationModel.findById(translationId).exec();
    if (!sub) {
      throw new NotFoundException('Translation submission not found');
    }

    sub.teacherComment = dto.teacherComment;
    sub.reviewedBy = teacher._id as Types.ObjectId;
    sub.reviewedAt = new Date();
    sub.status = TranslationSubmissionStatus.REVIEWED;

    await sub.save();

    return {
      id: extractObjectId(sub._id),
      status: sub.status.toUpperCase(),
      teacherComment: sub.teacherComment,
      reviewedAt: sub.reviewedAt,
      reviewedBy: extractObjectId(teacher._id),
    };
  }
}

