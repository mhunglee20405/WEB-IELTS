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
import { extractObjectId } from './submissions.service';

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
    @InjectModel(Submission.name)
    private readonly submissionModel: Model<SubmissionDocument>,
    @InjectModel(TranslationSubmission.name)
    private readonly translationModel: Model<TranslationSubmissionDocument>,
    private readonly submissionsService: SubmissionsService,
    private readonly translationsService: TranslationsService,
    private readonly extensionsService: ExtensionsService,
  ) {}

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
          { path: 'courseId', select: 'code title' },
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
    const isStudent = user.role === UserRole.STUDENT;
    if (isStudent && extractObjectId(sa.studentId?._id || sa.studentId) !== extractObjectId(user._id)) {
      throw new ForbiddenException('You cannot access another student’s assignment');
    }

    const snapshot = assignment.exerciseSnapshot;
    const exercise = assignment.exerciseId;
    const title = assignment.title || snapshot?.title || exercise?.title || 'Assignment';
    const exerciseType = snapshot?.type || exercise?.type || 'reading';
    const openAt = assignment.openAt || new Date();
    const dueAt = assignment.deadlineAt || new Date();
    const effectiveDueAt = sa.effectiveDeadlineAt || dueAt;

    const rawQuestions = snapshot?.questions || exercise?.questions || [];
    const sanitizedQuestions = rawQuestions.map((q: any, idx: number) => ({
      id: q.questionId || `q-${idx + 1}`,
      questionId: q.questionId || `q-${idx + 1}`,
      orderIndex: q.orderIndex ?? (idx + 1),
      prompt: q.prompt || '',
      type: q.type,
      points: q.points ?? 1,
      options: q.options || [],
    }));

    const exercisePublic = {
      id: extractObjectId(exercise?._id || assignment._id),
      title: snapshot?.title || exercise?.title || title,
      type: exerciseType,
      status: 'published',
      version: assignment.exerciseVersion || exercise?.version || 1,
      instructions: snapshot?.instructions || exercise?.instructions || '',
      passageHtml: snapshot?.passage || exercise?.passage || '',
      audioAssetId: snapshot?.audioAssets?.[0]?.objectKey || exercise?.audioAssetId || undefined,
      durationMinutes: exercise?.durationMinutes || undefined,
      passThreshold: assignment.targetScorePercent ?? 70,
      questions: sanitizedQuestions,
    };

    return {
      id: extractObjectId(sa._id),
      studentAssignmentId: extractObjectId(sa._id),
      assignmentId: extractObjectId(assignment._id),
      courseId: extractObjectId(assignment.courseId?._id || assignment.courseId),
      courseTitle: assignment.courseId?.title || '',
      studentId: extractObjectId(sa.studentId?._id || sa.studentId),
      studentName: (sa.studentId as any)?.fullName || '',
      title,
      exerciseType,
      assignedDate: assignment.assignedDate || formatVnDateTime(openAt).slice(0, 10),
      openAt: new Date(openAt).toISOString(),
      dueAt: new Date(dueAt).toISOString(),
      effectiveDueAt: new Date(effectiveDueAt).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh',
      status: sa.status,
      attemptsCount: (sa as any).attemptsCount || (sa.lastSubmittedAt ? 1 : 0),
      bestScore: sa.bestScore ?? null,
      passed: Boolean(sa.isTargetAchieved),
      answerReviewUnlocked: Boolean(sa.isTargetAchieved),
      translationAvailable: Boolean(sa.isTargetAchieved && exerciseType === 'reading'),
      translationStatus: (sa as any).translationStatus || 'not_started',
      penaltyApplied: Boolean((sa as any).penaltyApplied),
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

    const assignment = await this.assignmentModel
      .findById(sa.assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment || !assignment.exerciseSnapshot) {
      throw new NotFoundException('Exercise snapshot not found');
    }

    if (user.role === UserRole.STUDENT) {
      if (extractObjectId(sa.studentId) !== extractObjectId(user._id)) {
        throw new ForbiddenException('You cannot access another student’s review');
      }
      if (!sa.isTargetAchieved && sa.status !== StudentAssignmentStatus.PASSED) {
        throw new ForbiddenException('Review is locked until you achieve a PASS score (>= 70%)');
      }
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
      const studentAnswer = studentAnswersMap.get(q.questionId) || '';
      const exactMatch = q.answerSpecification?.exactMatch;
      const acceptedAnswers = q.answerSpecification?.acceptedAnswers || [];
      const correctAnswer =
        exactMatch ||
        acceptedAnswers[0] ||
        (q.options ? q.options.find((o: any) => o.isCorrect)?.text : '') ||
        '';
      const isCorrect = acceptedAnswers.length > 0
        ? acceptedAnswers.some((a: string) => a.trim().toLowerCase() === studentAnswer.trim().toLowerCase())
        : studentAnswer.trim().toLowerCase() === correctAnswer.trim().toLowerCase();

      return {
        questionId: q.questionId || `q-${idx + 1}`,
        orderIndex: q.orderIndex ?? (idx + 1),
        prompt: q.prompt || '',
        studentAnswer,
        correctAnswer,
        isCorrect,
        explanation: q.explanation || '',
      };
    });

    return {
      studentAssignmentId: extractObjectId(sa._id),
      passed: Boolean(sa.isTargetAchieved),
      score: sa.bestScore ?? (submission?.scorePercent || 0),
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
      .findById(sa.assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    const passageHtml = assignment?.exerciseSnapshot?.passage || '';
    const passageTitle = assignment?.exerciseSnapshot?.title || assignment?.title || 'Reading Passage';

    const existing = await this.translationModel
      .findOne({ studentAssignmentId: sa._id })
      .exec();

    return {
      translationId: existing ? extractObjectId(existing._id) : extractObjectId(sa._id),
      studentAssignmentId: extractObjectId(sa._id),
      passageTitle,
      passageHtml,
      draftText: existing?.translatedText || '',
      status: existing?.status || 'not_started',
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
      .findById(sa.assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    const translatedText = body.translatedText ?? body.textVi ?? '';
    let existing = await this.translationModel
      .findOne({ studentAssignmentId: sa._id })
      .exec();

    if (existing) {
      existing.translatedText = translatedText;
      existing.status = TranslationSubmissionStatus.DRAFT;
      await existing.save();
    } else {
      existing = new this.translationModel({
        studentAssignmentId: sa._id,
        assignmentId: sa.assignmentId,
        studentId: student._id,
        translatedText,
        status: TranslationSubmissionStatus.DRAFT,
      });
      await existing.save();
    }

    return {
      translationId: extractObjectId(existing._id),
      studentAssignmentId: extractObjectId(sa._id),
      passageTitle: assignment?.exerciseSnapshot?.title || assignment?.title || 'Reading Passage',
      passageHtml: assignment?.exerciseSnapshot?.passage || '',
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
      .findById(sa.assignmentId)
      .select('+exerciseSnapshot')
      .exec();

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
      passageTitle: assignment?.exerciseSnapshot?.title || assignment?.title || 'Reading Passage',
      passageHtml: assignment?.exerciseSnapshot?.passage || '',
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
