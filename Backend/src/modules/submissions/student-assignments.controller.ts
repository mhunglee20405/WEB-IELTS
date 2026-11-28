import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  UseGuards,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Optional,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, StudentAssignmentStatus, TranslationSubmissionStatus } from 'src/database/schemas/enums';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import { ExamTest, ExamTestDocument } from 'src/database/schemas/exam-test.schema';
import { PassageVocab, PassageVocabDocument } from 'src/database/schemas/passage-vocab.schema';
import { Submission, SubmissionDocument } from 'src/database/schemas/submission.schema';
import {
  TranslationSubmission,
  TranslationSubmissionDocument,
} from 'src/database/schemas/translation-submission.schema';
import { SubmissionsService } from './submissions.service';
import { TranslationsService } from 'src/modules/translations/translations.service';
import { ExtensionsService } from 'src/modules/extensions/extensions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { CreateExtensionRequestDto } from 'src/modules/extensions/dto/create-extension-request.dto';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import {
  extractObjectId,
  normalizeQuestionType,
  normalizeQuestionOptions,
  gradeExamQuestion,
} from './submissions.service';

@ApiTags('Student Assignments')
@Controller('student-assignments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class StudentAssignmentsController {
  constructor(
    @InjectModel(StudentAssignment.name)
    private readonly studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectModel(Assignment.name)
    private readonly assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name)
    private readonly courseModel: Model<CourseDocument>,
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(TranslationSubmission.name)
    private readonly translationModel: Model<TranslationSubmissionDocument>,
    private readonly submissionsService: SubmissionsService,
    private readonly translationsService: TranslationsService,
    private readonly extensionsService: ExtensionsService,
    @Optional()
    @InjectModel(ExamTest.name)
    private readonly examTestModel?: Model<ExamTestDocument>,
    @Optional()
    @InjectModel(PassageVocab.name)
    private readonly passageVocabModel?: Model<PassageVocabDocument>,
  ) {}

  private async assertAssignmentAccess(
    sa: StudentAssignmentDocument | any,
    assignment: AssignmentDocument | any,
    user: UserDocument,
  ): Promise<void> {
    if (user.role === UserRole.ADMIN) {
      return;
    }

    if (user.role === UserRole.STUDENT) {
      if (extractObjectId(sa.studentId) !== extractObjectId(user._id)) {
        throw new ForbiddenException('You cannot access another student’s assignment');
      }
      return;
    }

    if (user.role === UserRole.TEACHER) {
      let resolvedAssignment = assignment;
      if (!resolvedAssignment || !resolvedAssignment.courseId) {
        resolvedAssignment = await this.assignmentModel
          .findById(extractObjectId(sa.assignmentId))
          .exec();
      }
      const courseId = resolvedAssignment?.courseId;
      if (!courseId) {
        throw new ForbiddenException('You do not teach this course');
      }
      let teacherId = (courseId as any)?.teacherId;
      if (!teacherId) {
        const course = await this.courseModel.findById(extractObjectId(courseId)).exec();
        teacherId = course?.teacherId;
      }
      if (!teacherId || extractObjectId(teacherId) !== extractObjectId(user._id)) {
        throw new ForbiddenException('You do not teach this course');
      }
      return;
    }

    throw new ForbiddenException('Access denied');
  }

  private assertAssignmentOpenForStudent(assignment: any, user: UserDocument): void {
    if (user.role === UserRole.STUDENT && assignment?.openAt) {
      if (Date.now() < new Date(assignment.openAt).getTime()) {
        throw new ForbiddenException('Assignment is not yet open');
      }
    }
  }

  private isStudentAssignmentPassed(sa: any, assignment: any): boolean {
    const targetScore = assignment?.targetScorePercent ?? 70;
    return Boolean(
      sa.isTargetAchieved ||
        sa.status === StudentAssignmentStatus.PASSED ||
        (sa.bestScore !== undefined && sa.bestScore !== null && sa.bestScore >= targetScore),
    );
  }

  private mapPassageVocabItem(doc: any, fallbackTestId?: string) {
    return {
      id: extractObjectId(doc._id),
      passageId: doc.passageId,
      testId: doc.testId ? extractObjectId(doc.testId) : fallbackTestId,
      partNumber: doc.partNumber,
      word: doc.word,
      partOfSpeech: doc.partOfSpeech ?? 'n',
      ipa: doc.ipa || undefined,
      meaningVi: doc.meaningVi,
      paraphraseNote: doc.paraphraseNote || undefined,
      contextSentence: doc.contextSentence || undefined,
      order: doc.order ?? 0,
    };
  }

  private async resolveReadingExamContext(
    assignment: any,
    includeContent = true,
  ): Promise<{
    examTestId?: string;
    testId?: string;
    exerciseType: string;
    strictExamMode: boolean;
    requiredScope: string;
    requiredPartId: string | null;
    allowedModes: string[];
    durationSecondsOverride: number | null;
    maxAttempts?: number;
    allowRetake: boolean;
    passageId?: string;
    passageTitle?: string;
    passageHtml: string;
    passages: Array<{
      passageId: string;
      partNumber: number;
      title: string;
      passageTitle: string;
      passageHtml: string;
      passageVocabs: any[];
    }>;
    passageVocabs: any[];
  }> {
    const snapshot = assignment?.exerciseSnapshot;
    const populatedExercise =
      assignment?.exerciseId && typeof assignment.exerciseId === 'object' && assignment.exerciseId.title
        ? assignment.exerciseId
        : null;
    const rawExerciseId = assignment?.exerciseId ? extractObjectId(assignment.exerciseId) : '';
    const explicitExamTestId = assignment?.examTestId ? extractObjectId(assignment.examTestId) : '';

    let examTest: any = null;
    if (this.examTestModel && typeof this.examTestModel.findById === 'function') {
      const candidateId = explicitExamTestId || (!populatedExercise ? rawExerciseId : '');
      if (candidateId && Types.ObjectId.isValid(candidateId)) {
        const q = this.examTestModel.findById(candidateId);
        examTest = q
          ? await (typeof q.lean === 'function' ? q.lean().exec() : q.exec())
          : null;
      }
    }

    const examTestId = explicitExamTestId || (examTest ? extractObjectId(examTest._id) : undefined);
    const exerciseType = String(
      snapshot?.type ||
        populatedExercise?.type ||
        (examTest?.skill ? String(examTest.skill).toLowerCase() : '') ||
        'reading',
    ).toLowerCase();

    const scopedParts = (examTest?.parts || []).filter((p: any) => {
      if (assignment?.requiredScope === 'PART' && assignment?.requiredPartId) {
        return extractObjectId(p._id) === String(assignment.requiredPartId);
      }
      return true;
    });

    const fallbackPassageHtml =
      snapshot?.passage || populatedExercise?.passage || '';
    const fallbackTitle =
      snapshot?.title || populatedExercise?.title || assignment?.title || 'Reading Passage';
    const fallbackPassageId =
      assignment?.requiredPartId ||
      (populatedExercise?._id ? extractObjectId(populatedExercise._id) : '') ||
      rawExerciseId ||
      extractObjectId(assignment?._id);

    const rawPassages: Array<{
      passageId: string;
      partNumber: number;
      title: string;
      passageTitle: string;
      passageHtml: string;
    }> =
      scopedParts.length > 0
        ? scopedParts.map((part: any, idx: number) => {
            const pId = extractObjectId(part._id);
            const htmlFromParagraphs = Array.isArray(part.paragraphs)
              ? part.paragraphs
                  .map((pr: any) => `<p><strong>${pr.label}.</strong> ${pr.text}</p>`)
                  .join('')
              : '';
            return {
              passageId: pId,
              partNumber: part.ordinal || idx + 1,
              title: part.title || `Passage ${part.ordinal || idx + 1}`,
              passageTitle: part.title || `Passage ${part.ordinal || idx + 1}`,
              passageHtml: part.contentHtml || htmlFromParagraphs || fallbackPassageHtml,
            };
          })
        : exerciseType === 'reading' && (fallbackPassageHtml || fallbackPassageId)
          ? [
              {
                passageId: fallbackPassageId,
                partNumber: 1,
                title: fallbackTitle,
                passageTitle: fallbackTitle,
                passageHtml: fallbackPassageHtml,
              },
            ]
          : [];

    const vocabsByPassage = new Map<string, any[]>();
    if (
      includeContent &&
      this.passageVocabModel &&
      typeof this.passageVocabModel.find === 'function' &&
      rawPassages.length > 0
    ) {
      const passageIds = rawPassages.map((p) => p.passageId).filter(Boolean);
      if (passageIds.length > 0) {
        const q = this.passageVocabModel.find({ passageId: { $in: passageIds } });
        const sorted = typeof q?.sort === 'function' ? q.sort({ order: 1, createdAt: 1 }) : q;
        const leanOrExec = typeof sorted?.lean === 'function' ? sorted.lean() : sorted;
        const vocabDocs = await (typeof leanOrExec?.exec === 'function' ? leanOrExec.exec() : leanOrExec);
        for (const v of vocabDocs || []) {
          const pId = String(v.passageId || '');
          const list = vocabsByPassage.get(pId) ?? [];
          list.push(this.mapPassageVocabItem(v, examTestId));
          vocabsByPassage.set(pId, list);
        }
      }
    }

    const passages = includeContent
      ? rawPassages.map((p) => ({
          ...p,
          passageVocabs: vocabsByPassage.get(p.passageId) ?? [],
        }))
      : [];

    const primaryPassage = passages[0] ?? rawPassages[0];
    const combinedPassageHtml = includeContent
      ? rawPassages.map((p) => p.passageHtml).filter(Boolean).join('\n\n') || fallbackPassageHtml
      : '';

    return {
      examTestId,
      testId: examTestId,
      exerciseType,
      strictExamMode: Boolean(assignment?.strictExamMode),
      requiredScope: assignment?.requiredScope || 'FULL',
      requiredPartId: assignment?.requiredPartId || null,
      allowedModes: assignment?.allowedModes || ['PART', 'FULL'],
      durationSecondsOverride: assignment?.durationSecondsOverride ?? null,
      maxAttempts: assignment?.maxAttempts,
      allowRetake: Boolean(assignment?.allowRetake),
      passageId: primaryPassage?.passageId || fallbackPassageId || undefined,
      passageTitle: primaryPassage?.passageTitle || fallbackTitle,
      passageHtml: combinedPassageHtml,
      passages,
      passageVocabs: includeContent && primaryPassage
        ? (vocabsByPassage.get(primaryPassage.passageId) ?? [])
        : [],
    };
  }

  @Get(':id')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get student assignment detail with sanitized exercise questions' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async getDetail(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel
      .findById(id)
      .populate({
        path: 'assignmentId',
        select: '+exerciseSnapshot',
        populate: [
          { path: 'courseId', select: 'code title teacherId' },
          {
            path: 'exerciseId',
            select: 'title type passScore instructions passage audioAssetId durationMinutes questions version',
          },
        ],
      })
      .populate('studentId', 'fullName email')
      .exec();

    if (!sa || !sa.assignmentId) {
      throw new NotFoundException('Student assignment not found');
    }

    const assignment: any = sa.assignmentId;
    await this.assertAssignmentAccess(sa, assignment, user);
    const isStudent = user.role === UserRole.STUDENT;

    const snapshot = assignment.exerciseSnapshot;
    const exercise = assignment.exerciseId;
    const title = assignment.title || snapshot?.title || exercise?.title || 'Assignment';
    const exerciseType = snapshot?.type || exercise?.type || 'reading';
    const openAt = assignment.openAt || new Date();
    const dueAt = assignment.deadlineAt || new Date();
    const effectiveDueAt = sa.effectiveDeadlineAt || dueAt;

    const isLocked = isStudent && new Date().getTime() < new Date(openAt).getTime();
    const readingCtx = await this.resolveReadingExamContext(assignment, !isLocked);
    const rawQuestions = snapshot?.questions || exercise?.questions || [];
    const sanitizedQuestions = isLocked
      ? []
      : rawQuestions.map((q: any, idx: number) => {
          const raw = typeof q.toObject === 'function' ? q.toObject() : q;
          const qId = String(
            raw.questionId || (raw.number !== undefined ? String(raw.number) : undefined) || raw.id || `q-${idx + 1}`,
          );
          const normType = normalizeQuestionType(raw.type);
          return {
            id: qId,
            questionId: qId,
            orderIndex: raw.orderIndex ?? (raw.number !== undefined ? raw.number : idx + 1),
            prompt: raw.prompt || '',
            type: normType,
            rawType: raw.type,
            multiple: raw.type === 'MULTIPLE_CHOICE_MULTIPLE' || Boolean(raw.multiple),
            points: raw.points ?? 1,
            options: normalizeQuestionOptions(raw.options),
          };
        });

    const exercisePublic = {
      id: extractObjectId(exercise?._id || readingCtx.examTestId || assignment._id),
      title: snapshot?.title || exercise?.title || title,
      type: readingCtx.exerciseType || exerciseType,
      status: 'published',
      version: assignment.exerciseVersion || exercise?.version || 1,
      instructions: isLocked ? '' : (snapshot?.instructions || exercise?.instructions || ''),
      passageId: isLocked ? undefined : readingCtx.passageId,
      passageHtml: isLocked ? '' : (readingCtx.passageHtml || snapshot?.passage || exercise?.passage || ''),
      audioAssetId: isLocked ? undefined : (snapshot?.audioAssets?.[0]?.objectKey || exercise?.audioAssetId || undefined),
      audioUrl: isLocked ? undefined : (snapshot?.audioAssets?.[0]?.url || undefined),
      durationMinutes: exercise?.durationMinutes || undefined,
      passThreshold: assignment.targetScorePercent ?? 70,
      questions: sanitizedQuestions,
      questionCount: rawQuestions.length,
      isLocked,
    };

    const actualAttemptsCount = await this.submissionModel
      .countDocuments({ studentAssignmentId: sa._id })
      .exec();

    const passed = this.isStudentAssignmentPassed(sa, assignment);
    const resolvedType = readingCtx.exerciseType || exerciseType;

    return {
      id: extractObjectId(sa._id),
      studentAssignmentId: extractObjectId(sa._id),
      assignmentId: extractObjectId(assignment._id),
      ...(readingCtx.examTestId ? { examTestId: readingCtx.examTestId, testId: readingCtx.examTestId } : {}),
      requiredScope: readingCtx.requiredScope,
      requiredPartId: readingCtx.requiredPartId,
      allowedModes: readingCtx.allowedModes,
      durationSecondsOverride: readingCtx.durationSecondsOverride,
      maxAttempts: readingCtx.maxAttempts ?? null,
      allowRetake: readingCtx.allowRetake,
      strictExamMode: readingCtx.strictExamMode,
      ...(readingCtx.passageId ? { passageId: readingCtx.passageId } : {}),
      ...(isLocked ? {} : { passages: readingCtx.passages, passageVocabs: readingCtx.passageVocabs }),
      courseId: extractObjectId(assignment.courseId?._id || assignment.courseId),
      courseTitle: assignment.courseId?.title || '',
      studentId: extractObjectId(sa.studentId?._id || sa.studentId),
      studentName: (sa.studentId as any)?.fullName || '',
      title,
      exerciseType: resolvedType,
      assignedDate: assignment.assignedDate || formatVnDateTime(openAt).slice(0, 10),
      openAt: new Date(openAt).toISOString(),
      dueAt: new Date(dueAt).toISOString(),
      effectiveDueAt: new Date(effectiveDueAt).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      status: passed ? StudentAssignmentStatus.PASSED : sa.status,
      attemptsCount: actualAttemptsCount || (sa as any).attemptsCount || (sa.lastSubmittedAt ? 1 : 0),
      bestScore: sa.bestScore ?? null,
      passed,
      answerReviewUnlocked: passed,
      translationAvailable: Boolean(passed && (resolvedType === 'reading' || !resolvedType)),
      translationStatus: (sa as any).translationStatus || 'not_started',
      penaltyApplied: Boolean(sa.penaltyAppliedAt),
      exercise: exercisePublic,
    };
  }

  @Post(':id/submissions')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Submit answers for a student assignment' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async submitAnswers(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() student: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel.findById(id).exec();
    if (!sa) {
      throw new NotFoundException('Student assignment not found');
    }

    if (extractObjectId(sa.studentId) !== extractObjectId(student._id)) {
      throw new ForbiddenException('You can only submit your own assignments');
    }

    let answersList: { questionId: string; value: string }[] = [];
    if (Array.isArray(body.answers)) {
      answersList = body.answers;
    } else if (body.answers && typeof body.answers === 'object') {
      answersList = Object.entries(body.answers).map(([questionId, value]) => ({
        questionId,
        value: String(value ?? ''),
      }));
    }

    const dto: CreateSubmissionDto = {
      answers: answersList,
    };

    const result = await this.submissionsService.submit(
      extractObjectId(sa.assignmentId),
      dto,
      student,
    );

    return {
      submissionId: result.submissionId || result.id,
      id: result.id,
      attemptNo: result.attemptNo,
      score: result.scorePercent,
      scorePercent: result.scorePercent,
      passed: result.isPassed,
      isPassed: result.isPassed,
      bestScore: sa.bestScore != null ? Math.max(sa.bestScore, result.scorePercent) : result.scorePercent,
      answerReviewUnlocked: Boolean(result.isPassed),
      translationAvailable: Boolean(result.isPassed),
      submittedAt: result.submittedAt ? new Date(result.submittedAt).toISOString() : new Date().toISOString(),
      feedback: result.feedback,
    };
  }

  @Get(':id/submissions')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'List submissions for this student assignment' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async listSubmissions(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel.findById(id).exec();
    if (!sa) {
      throw new NotFoundException('Student assignment not found');
    }

    await this.assertAssignmentAccess(sa, null, user);

    const submissions = await this.submissionModel
      .find({ studentAssignmentId: sa._id })
      .sort({ attemptNo: 1 })
      .exec();

    return submissions.map((s) => ({
      id: extractObjectId(s._id),
      submissionId: extractObjectId(s._id),
      attemptNo: s.attemptNo,
      score: s.scorePercent,
      scorePercent: s.scorePercent,
      passed: s.isPassed,
      isPassed: s.isPassed,
      submittedAt: s.submittedAt ? new Date(s.submittedAt).toISOString() : new Date().toISOString(),
    }));
  }

  @Get(':id/review')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get answer review and explanations' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async getReview(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel
      .findById(id)
      .populate('assignmentId')
      .exec();

    if (!sa || !sa.assignmentId) {
      throw new NotFoundException('Student assignment not found');
    }

    await this.assertAssignmentAccess(sa, sa.assignmentId, user);

    const assignment = await this.assignmentModel
      .findById(extractObjectId(sa.assignmentId))
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment || !assignment.exerciseSnapshot) {
      throw new NotFoundException('Exercise snapshot not found');
    }

    const passed = this.isStudentAssignmentPassed(sa, assignment);
    if (user.role === UserRole.STUDENT && !passed) {
      const targetScore = assignment.targetScorePercent ?? 70;
      throw new ForbiddenException(
        `Review is locked until you achieve a PASS score (>= ${targetScore}%)`,
      );
    }

    const submission = await this.submissionModel
      .findOne({ studentAssignmentId: sa._id })
      .sort({ scorePercent: -1, attemptNo: -1 })
      .exec();

    const studentAnswersMap = new Map<string, string>();
    if (submission && submission.answers) {
      for (const a of submission.answers) {
        studentAnswersMap.set(a.questionId, a.value || '');
      }
    }

    const questions = assignment.exerciseSnapshot.questions || [];
    const items = questions.map((q: any, idx: number) => {
      const raw = typeof q.toObject === 'function' ? q.toObject() : q;
      const qId = String(
        raw.questionId || (raw.number !== undefined ? String(raw.number) : undefined) || raw.id || `q-${idx + 1}`,
      );
      const studentAnswer =
        studentAnswersMap.get(qId) ||
        (raw.questionId ? studentAnswersMap.get(raw.questionId) : '') ||
        '';
      let isCorrect = false;
      let correctAnswer = '';

      if (raw.grading && raw.grading.acceptedKeys && raw.grading.acceptedKeys.length > 0) {
        const gradeRes = gradeExamQuestion(raw.type, studentAnswer, raw.grading, raw.points ?? 1);
        isCorrect = gradeRes.isCorrect;
        correctAnswer = raw.grading.acceptedKeys.join(' / ');
      } else {
        const exactMatch = raw.answerSpecification?.exactMatch;
        const acceptedAnswers = raw.answerSpecification?.acceptedAnswers || [];
        const correctKey = raw.answerSpecification?.correctKey;
        correctAnswer =
          correctKey ||
          exactMatch ||
          acceptedAnswers[0] ||
          (raw.options ? raw.options.find((o: any) => o.isCorrect)?.text : '') ||
          '';
        isCorrect = acceptedAnswers.length > 0
          ? acceptedAnswers.some((a: string) => a.trim().toLowerCase() === studentAnswer.trim().toLowerCase())
          : studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();
      }

      return {
        questionId: qId,
        orderIndex: raw.orderIndex ?? (raw.number !== undefined ? raw.number : idx + 1),
        prompt: raw.prompt || '',
        studentAnswer,
        correctAnswer,
        isCorrect,
        explanation: raw.explanation || raw.grading?.explanation || '',
      };
    });

    const readingCtx = await this.resolveReadingExamContext(assignment, true);

    return {
      studentAssignmentId: extractObjectId(sa._id),
      passed,
      score: sa.bestScore ?? (submission?.scorePercent || 0),
      title: assignment.title || assignment.exerciseSnapshot?.title || 'Assignment',
      exerciseType: readingCtx.exerciseType,
      ...(readingCtx.examTestId ? { examTestId: readingCtx.examTestId, testId: readingCtx.examTestId } : {}),
      ...(readingCtx.passageId ? { passageId: readingCtx.passageId } : {}),
      passageTitle: readingCtx.passageTitle,
      passageHtml: readingCtx.passageHtml,
      passages: readingCtx.passages,
      passageVocabs: readingCtx.passageVocabs,
      strictExamMode: readingCtx.strictExamMode,
      items,
    };
  }

  @Get(':id/translation')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get reading translation workspace' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async getTranslation(@Param('id') id: string, @CurrentUser() user: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel
      .findById(id)
      .populate('assignmentId')
      .exec();

    if (!sa || !sa.assignmentId) {
      throw new NotFoundException('Student assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(extractObjectId(sa.assignmentId))
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assertAssignmentAccess(sa, assignment, user);
    this.assertAssignmentOpenForStudent(assignment, user);

    const snapshot = (assignment.exerciseSnapshot || {}) as any;
    const readingCtx = await this.resolveReadingExamContext(assignment, true);
    const targetTestId = readingCtx.examTestId || (assignment as any)?.exerciseId;

    const existing = await this.translationModel
      .findOne({
        $or: [
          { studentAssignmentId: sa._id },
          { studentId: sa.studentId, assignmentId: assignment._id },
          ...(targetTestId ? [{ studentId: sa.studentId, testId: targetTestId }] : []),
          ...(snapshot?._id ? [{ studentId: sa.studentId, testId: snapshot._id }] : []),
        ],
      })
      .sort({ updatedAt: -1 })
      .exec();

    const matchedPassage = existing?.passageId
      ? readingCtx.passages.find((p) => p.passageId === String(existing.passageId))
      : readingCtx.passages[0];

    let passageId = matchedPassage?.passageId || readingCtx.passageId;
    let passageHtml = matchedPassage?.passageHtml || readingCtx.passageHtml || snapshot.passage || '';
    let passageTitle = matchedPassage?.passageTitle || readingCtx.passageTitle || snapshot.title || assignment.title || 'Reading Passage';
    const passageVocabs = matchedPassage?.passageVocabs ?? readingCtx.passageVocabs;

    if (!matchedPassage && snapshot.parts && snapshot.parts.length > 0) {
      const part = existing?.passageId
        ? snapshot.parts.find(
            (p: any) =>
              extractObjectId(p._id) === String(existing.passageId) ||
              String(p.ordinal) === String(existing.passageId),
          )
        : snapshot.parts[0];
      if (part) {
        passageId = extractObjectId(part._id) || passageId;
        passageHtml = part.contentHtml || passageHtml;
        passageTitle = part.title || (part.ordinal ? `Passage ${part.ordinal}` : passageTitle);
      }
    }

    const trStatus = (existing?.status || 'not_started').toLowerCase();

    return {
      translationId: existing ? extractObjectId(existing._id) : extractObjectId(sa._id),
      studentAssignmentId: extractObjectId(sa._id),
      ...(readingCtx.examTestId ? { examTestId: readingCtx.examTestId, testId: readingCtx.examTestId } : {}),
      ...(passageId ? { passageId } : {}),
      passageTitle,
      passageHtml,
      passages: readingCtx.passages,
      passageVocabs,
      draftText: existing?.translatedText || '',
      status: trStatus,
      teacherFeedback: existing?.teacherComment || undefined,
      submittedAt: existing?.submittedAt ? new Date(existing.submittedAt).toISOString() : undefined,
      reviewedAt: existing?.reviewedAt ? new Date(existing.reviewedAt).toISOString() : undefined,
    };
  }

  @Put(':id/translation/draft')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Save draft translation for reading passage' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async saveTranslationDraft(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() student: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel.findById(id).exec();
    if (!sa) {
      throw new NotFoundException('Student assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(extractObjectId(sa.assignmentId))
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assertAssignmentAccess(sa, assignment, student);
    this.assertAssignmentOpenForStudent(assignment, student);

    const readingCtx = await this.resolveReadingExamContext(assignment, true);
    const translatedText = body.translatedText ?? body.textVi ?? '';
    let existing = await this.translationModel
      .findOne({ studentAssignmentId: sa._id })
      .exec();

    if (existing) {
      if (
        existing.status === TranslationSubmissionStatus.SUBMITTED ||
        existing.status === TranslationSubmissionStatus.REVIEWED
      ) {
        throw new BadRequestException('Cannot edit a submitted or reviewed translation');
      }
      existing.translatedText = translatedText;
      existing.status = TranslationSubmissionStatus.DRAFT;
      await existing.save();
    } else {
      existing = new this.translationModel({
        studentAssignmentId: sa._id,
        assignmentId: sa.assignmentId,
        studentId: student._id,
        ...(readingCtx.examTestId && Types.ObjectId.isValid(readingCtx.examTestId)
          ? { testId: new Types.ObjectId(readingCtx.examTestId) }
          : {}),
        ...(readingCtx.passageId ? { passageId: readingCtx.passageId } : {}),
        translatedText,
        status: TranslationSubmissionStatus.DRAFT,
      });
      await existing.save();
    }

    return {
      translationId: extractObjectId(existing._id),
      studentAssignmentId: extractObjectId(sa._id),
      ...(readingCtx.examTestId ? { examTestId: readingCtx.examTestId, testId: readingCtx.examTestId } : {}),
      ...(readingCtx.passageId ? { passageId: readingCtx.passageId } : {}),
      passageTitle: readingCtx.passageTitle || assignment.exerciseSnapshot?.title || assignment.title || 'Reading Passage',
      passageHtml: readingCtx.passageHtml || assignment.exerciseSnapshot?.passage || '',
      passages: readingCtx.passages,
      passageVocabs: readingCtx.passageVocabs,
      draftText: existing.translatedText,
      status: existing.status,
      teacherFeedback: existing.teacherComment || undefined,
      submittedAt: existing.submittedAt ? new Date(existing.submittedAt).toISOString() : undefined,
      reviewedAt: existing.reviewedAt ? new Date(existing.reviewedAt).toISOString() : undefined,
    };
  }

  @Post(':id/translation/submit')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Submit translation for reading passage' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async submitTranslation(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() student: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Student assignment not found');
    }

    const sa = await this.studentAssignmentModel.findById(id).exec();
    if (!sa) {
      throw new NotFoundException('Student assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(extractObjectId(sa.assignmentId))
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    await this.assertAssignmentAccess(sa, assignment, student);
    this.assertAssignmentOpenForStudent(assignment, student);

    const readingCtx = await this.resolveReadingExamContext(assignment, true);
    const translatedText = body.translatedText ?? body.textVi ?? '';
    const result = await this.translationsService.submit(
      extractObjectId(sa.assignmentId),
      {
        translatedText,
        status: TranslationSubmissionStatus.SUBMITTED,
      },
      student,
    );

    return {
      translationId: extractObjectId(result.id || (result as any)._id),
      studentAssignmentId: extractObjectId(sa._id),
      ...(readingCtx.examTestId ? { examTestId: readingCtx.examTestId, testId: readingCtx.examTestId } : {}),
      ...(readingCtx.passageId ? { passageId: readingCtx.passageId } : {}),
      passageTitle: readingCtx.passageTitle || assignment.exerciseSnapshot?.title || assignment.title || 'Reading Passage',
      passageHtml: readingCtx.passageHtml || assignment.exerciseSnapshot?.passage || '',
      passages: readingCtx.passages,
      passageVocabs: readingCtx.passageVocabs,
      draftText: translatedText,
      status: result.status,
      teacherFeedback: (result as any).teacherComment || undefined,
      submittedAt: result.submittedAt ? new Date(result.submittedAt).toISOString() : new Date().toISOString(),
      reviewedAt: (result as any).reviewedAt ? new Date((result as any).reviewedAt).toISOString() : undefined,
    };
  }

  @Post(':id/extensions')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Request extension for student assignment' })
  @ApiParam({ name: 'id', description: 'StudentAssignment ObjectId' })
  async createExtension(
    @Param('id') id: string,
    @Body() body: any,
    @CurrentUser() student: UserDocument,
  ) {
    const requestedDeadlineAt = body.requestedDeadlineAt || body.requestedDueAt;
    const dto: CreateExtensionRequestDto = {
      studentAssignmentId: id,
      requestedDeadlineAt,
      reason: body.reason,
    };
    return this.extensionsService.create(dto, student);
  }
}
