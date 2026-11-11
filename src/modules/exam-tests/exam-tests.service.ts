import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  ExamTest,
  ExamTestDocument,
  ExamPart,
  QuestionGroup,
} from 'src/database/schemas/exam-test.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExamSkill,
  ExamMode,
  ExamTestStatus,
  UserRole,
  PartType,
} from 'src/database/schemas/enums';
import {
  CreateExamTestDto,
  UpdateExamTestDto,
  CreateExamPartDto,
  UpdateExamPartDto,
  CreateQuestionGroupDto,
  UpdateQuestionGroupDto,
  ExamTestQueryDto,
} from './dto/exam-test.dto';
import { ExamTestMapper, extractObjectId } from './mappers/exam-test.mapper';

@Injectable()
export class ExamTestsService {
  constructor(
    @InjectModel(ExamTest.name)
    private examTestModel: Model<ExamTestDocument>,
  ) {}

  private checkTeacherOwnership(test: ExamTestDocument, actor: UserDocument) {
    if (actor.role === UserRole.ADMIN) return;
    if (actor.role !== UserRole.TEACHER) {
      throw new ForbiddenException('Only teachers or admins can manage exam tests');
    }
    if (extractObjectId(test.createdBy) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('You do not have permission to manage this exam test');
    }
  }

  private checkDraftStatus(test: ExamTestDocument) {
    if (test.status !== ExamTestStatus.DRAFT) {
      throw new BadRequestException(
        `Cannot modify a ${test.status} exam test. Please create a new version instead.`,
      );
    }
  }

  async create(dto: CreateExamTestDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot create exam tests');
    }

    const test = new this.examTestModel({
      title: dto.title,
      skill: dto.skill,
      description: dto.description,
      examPreset: dto.examPreset,
      allowedModes: dto.allowedModes || [ExamMode.PART, ExamMode.FULL],
      passScore: dto.passScore ?? 70,
      fullDurationSeconds: dto.fullDurationSeconds || (dto.skill === ExamSkill.READING ? 3600 : 1800),
      translationEnabled: Boolean(dto.translationEnabled),
      status: ExamTestStatus.DRAFT,
      version: 1,
      parts: [],
      createdBy: actor._id,
    });

    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async findAllTeacher(actor: UserDocument, query: ExamTestQueryDto) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot access teacher exam tests');
    }

    const filter: Record<string, any> = {};
    if (actor.role === UserRole.TEACHER) {
      filter.createdBy = actor._id;
    }
    if (query.skill) {
      filter.skill = query.skill;
    }
    if (query.status) {
      filter.status = query.status;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [docs, total] = await Promise.all([
      this.examTestModel
        .find(filter)
        .sort({ updatedAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.examTestModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => ExamTestMapper.toTeacherDetailedTest(d)),
      total,
      page,
      limit,
    };
  }

  async findAllPublished(query: ExamTestQueryDto) {
    const filter: Record<string, any> = { status: ExamTestStatus.PUBLISHED };
    if (query.skill) {
      filter.skill = query.skill;
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const [docs, total] = await Promise.all([
      this.examTestModel
        .find(filter)
        .sort({ publishedAt: -1, createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.examTestModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => ExamTestMapper.toStudentSafeTest(d)),
      total,
      page,
      limit,
    };
  }

  async findByIdTeacher(testId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    return ExamTestMapper.toTeacherDetailedTest(test);
  }

  async findByIdStudent(testId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    if (test.status !== ExamTestStatus.PUBLISHED && actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('This exam test is not available for practice');
    }
    return ExamTestMapper.toStudentSafeTest(test);
  }

  async findPartStudent(testId: string, partId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    if (test.status !== ExamTestStatus.PUBLISHED && actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('This exam test is not available for practice');
    }

    const part = test.parts.find((p: any) => extractObjectId(p._id) === partId);
    if (!part) {
      throw new NotFoundException('Part not found in this exam test');
    }

    return ExamTestMapper.toStudentSafePart(part);
  }

  async update(testId: string, dto: UpdateExamTestDto, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    if (dto.title !== undefined) test.title = dto.title;
    if (dto.description !== undefined) test.description = dto.description;
    if (dto.examPreset !== undefined) test.examPreset = dto.examPreset;
    if (dto.allowedModes !== undefined) test.allowedModes = dto.allowedModes;
    if (dto.passScore !== undefined) test.passScore = dto.passScore;
    if (dto.fullDurationSeconds !== undefined) test.fullDurationSeconds = dto.fullDurationSeconds;
    if (dto.translationEnabled !== undefined) test.translationEnabled = dto.translationEnabled;

    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async addPart(testId: string, dto: CreateExamPartDto, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    // Validate part type matches skill
    if (test.skill === ExamSkill.READING && dto.type !== PartType.PASSAGE) {
      throw new BadRequestException('Reading tests only accept PASSAGE parts');
    }
    if (test.skill === ExamSkill.LISTENING && dto.type !== PartType.SECTION) {
      throw new BadRequestException('Listening tests only accept SECTION parts');
    }

    const newPart: any = {
      _id: new Types.ObjectId(),
      type: dto.type,
      ordinal: dto.ordinal,
      title: dto.title,
      contentHtml: dto.contentHtml,
      audioAssetId: dto.audioAssetId && Types.ObjectId.isValid(dto.audioAssetId) ? new Types.ObjectId(dto.audioAssetId) : undefined,
      durationSeconds: dto.durationSeconds,
      questionGroups: [],
    };

    test.parts.push(newPart);
    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async updatePart(testId: string, partId: string, dto: UpdateExamPartDto, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    const part = test.parts.find((p: any) => extractObjectId(p._id) === partId);
    if (!part) {
      throw new NotFoundException('Part not found');
    }

    if (dto.title !== undefined) part.title = dto.title;
    if (dto.ordinal !== undefined) part.ordinal = dto.ordinal;
    if (dto.contentHtml !== undefined) part.contentHtml = dto.contentHtml;
    if (dto.audioAssetId !== undefined) {
      part.audioAssetId = dto.audioAssetId && Types.ObjectId.isValid(dto.audioAssetId) ? new Types.ObjectId(dto.audioAssetId) : undefined;
    }
    if (dto.durationSeconds !== undefined) part.durationSeconds = dto.durationSeconds;

    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async deletePart(testId: string, partId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    const partIndex = test.parts.findIndex((p: any) => extractObjectId(p._id) === partId);
    if (partIndex === -1) {
      throw new NotFoundException('Part not found');
    }

    test.parts.splice(partIndex, 1);
    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async addQuestionGroup(
    testId: string,
    partId: string,
    dto: CreateQuestionGroupDto,
    actor: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    const part = test.parts.find((p: any) => extractObjectId(p._id) === partId);
    if (!part) {
      throw new NotFoundException('Part not found in this test');
    }

    const newGroup: any = {
      _id: new Types.ObjectId(),
      type: dto.type,
      title: dto.title,
      instruction: dto.instruction,
      order: dto.order,
      sharedOptions: dto.sharedOptions,
      maxWords: dto.maxWords,
      questions: dto.questions.map((q) => ({
        number: q.number,
        prompt: q.prompt,
        type: q.type || dto.type,
        points: q.points ?? 1,
        options: q.options,
        grading: q.grading,
      })),
    };

    part.questionGroups.push(newGroup);
    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async updateQuestionGroup(
    testId: string,
    groupId: string,
    dto: UpdateQuestionGroupDto,
    actor: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);
    this.checkDraftStatus(test);

    let targetGroup: any = null;
    for (const p of test.parts) {
      const g = (p.questionGroups || []).find((gr: any) => extractObjectId(gr._id) === groupId);
      if (g) {
        targetGroup = g;
        break;
      }
    }

    if (!targetGroup) {
      throw new NotFoundException('Question group not found');
    }

    if (dto.title !== undefined) targetGroup.title = dto.title;
    if (dto.instruction !== undefined) targetGroup.instruction = dto.instruction;
    if (dto.type !== undefined) targetGroup.type = dto.type;
    if (dto.order !== undefined) targetGroup.order = dto.order;
    if (dto.sharedOptions !== undefined) targetGroup.sharedOptions = dto.sharedOptions;
    if (dto.maxWords !== undefined) targetGroup.maxWords = dto.maxWords;
    if (dto.questions !== undefined) {
      targetGroup.questions = dto.questions.map((q) => ({
        number: q.number,
        prompt: q.prompt,
        type: q.type || targetGroup.type,
        points: q.points ?? 1,
        options: q.options,
        grading: q.grading,
      }));
    }

    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async validateTest(testId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);

    const errors: string[] = [];
    if (!test.parts || test.parts.length === 0) {
      errors.push('Test must contain at least 1 part (Passage or Section)');
    }

    const seenNumbers = new Set<number>();
    let totalQuestions = 0;

    for (const p of test.parts || []) {
      if (test.skill === ExamSkill.READING && !p.contentHtml) {
        errors.push(`Passage "${p.title}" must contain contentHtml reading text`);
      }

      let partQuestions = 0;
      for (const g of p.questionGroups || []) {
        for (const q of g.questions || []) {
          totalQuestions++;
          partQuestions++;
          if (seenNumbers.has(q.number)) {
            errors.push(`Duplicate question number: ${q.number}`);
          }
          seenNumbers.add(q.number);

          if (!q.grading || !q.grading.acceptedKeys || q.grading.acceptedKeys.length === 0) {
            errors.push(`Question #${q.number} is missing grading/acceptedKeys`);
          }
          if (q.points === undefined || q.points <= 0) {
            errors.push(`Question #${q.number} must have positive points`);
          }
        }
      }

      if (partQuestions === 0) {
        errors.push(`Part "${p.title}" must contain at least one question`);
      }
    }

    if (totalQuestions === 0) {
      errors.push('Exam test has no questions');
    }

    return {
      testId,
      isValid: errors.length === 0,
      totalQuestions,
      errors,
    };
  }

  async preview(testId: string, actor: UserDocument, mode?: ExamMode, partId?: string) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);

    if (mode === ExamMode.PART && partId) {
      const part = test.parts.find((p: any) => extractObjectId(p._id) === partId);
      if (!part) {
        throw new NotFoundException('Part not found');
      }
      return ExamTestMapper.toStudentSafePart(part);
    }

    return ExamTestMapper.toStudentSafeTest(test);
  }

  async publish(testId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const test = await this.examTestModel.findById(testId).exec();
    if (!test) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(test, actor);

    const validation = await this.validateTest(testId, actor);
    if (!validation.isValid) {
      throw new UnprocessableEntityException({
        statusCode: 422,
        error: 'Unprocessable Entity',
        code: 'EXAM_PUBLISH_VALIDATION_FAILED',
        message: 'Cannot publish exam test due to validation errors',
        errors: validation.errors,
      });
    }

    test.status = ExamTestStatus.PUBLISHED;
    test.publishedAt = new Date();
    const saved = await test.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }

  async newVersion(testId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(testId)) {
      throw new NotFoundException('Exam test not found');
    }
    const original = await this.examTestModel.findById(testId).exec();
    if (!original) {
      throw new NotFoundException('Exam test not found');
    }
    this.checkTeacherOwnership(original, actor);

    const raw: any = original.toObject();
    delete raw._id;
    delete raw.createdAt;
    delete raw.updatedAt;

    // Deep clone parts and give them fresh IDs
    const clonedParts = (raw.parts || []).map((p: any) => {
      const partId = new Types.ObjectId();
      const questionGroups = (p.questionGroups || []).map((g: any) => ({
        ...g,
        _id: new Types.ObjectId(),
        questions: (g.questions || []).map((q: any) => ({ ...q })),
      }));
      return {
        ...p,
        _id: partId,
        questionGroups,
      };
    });

    const newDraft = new this.examTestModel({
      ...raw,
      title: `${original.title} (v${original.version + 1})`,
      version: original.version + 1,
      status: ExamTestStatus.DRAFT,
      parts: clonedParts,
      createdBy: actor._id,
      publishedAt: undefined,
    });

    const saved = await newDraft.save();
    return ExamTestMapper.toTeacherDetailedTest(saved);
  }
}
