import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectModel, InjectConnection } from '@nestjs/mongoose';
import { Model, Connection, Types } from 'mongoose';
import { Submission, SubmissionDocument } from 'src/database/schemas/submission.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  QuestionType,
  StudentAssignmentStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { formatVnDateTime } from 'src/common/utils/timezone.util';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';

export function extractObjectId(ref: unknown): string {
  if (ref instanceof Types.ObjectId) {
    return ref.toHexString();
  }
  if (ref && typeof ref === 'object' && '_id' in ref) {
    const id = (ref as { _id: unknown })._id;
    return id instanceof Types.ObjectId ? id.toHexString() : String(id);
  }
  return String(ref);
}

/**
 * Normalizes text answers reliably without loose fuzzy matching:
 * - Trims leading and trailing whitespace
 * - Collapses consecutive whitespace characters into a single space
 * - Converts to lowercase if caseSensitive is false
 */
export function normalizeText(value: string, caseSensitive = false): string {
  if (!value) return '';
  const collapsed = value.trim().replace(/\s+/g, ' ');
  return caseSensitive ? collapsed : collapsed.toLowerCase();
}

/**
 * Normalizes True/False/Not Given and Yes/No/Not Given tokens
 */
export function normalizeTFNG(value: string): string {
  const norm = value.trim().toUpperCase().replace(/\s+/g, ' ');
  if (norm === 'T') return 'TRUE';
  if (norm === 'F') return 'FALSE';
  if (norm === 'Y') return 'YES';
  if (norm === 'N') return 'NO';
  if (norm === 'NG') return 'NOT GIVEN';
  return norm;
}

export function normalizeQuestionType(type: string | undefined): string {
  if (!type) return 'mcq';
  const upper = String(type).toUpperCase().trim();
  const lower = String(type).toLowerCase().trim();

  if (upper === 'TRUE_FALSE_NOT_GIVEN' || lower === 'tfng' || lower === 'true_false_not_given') {
    return 'tfng';
  }
  if (upper === 'YES_NO_NOT_GIVEN' || lower === 'ynng' || lower === 'yes_no_not_given') {
    return 'ynng';
  }
  if (upper.startsWith('MATCHING') || lower === 'matching') {
    return 'matching';
  }
  if (
    upper.endsWith('_COMPLETION') ||
    upper === 'FILL_BLANK' ||
    upper === 'FILL_IN_THE_BLANK' ||
    lower === 'fill_blank' ||
    lower === 'fill_in_the_blank'
  ) {
    return 'fill_blank';
  }
  if (upper === 'SHORT_ANSWER' || lower === 'short_answer') {
    return 'short_answer';
  }
  if (
    upper.startsWith('MULTIPLE_CHOICE') ||
    lower === 'mcq' ||
    lower === 'multiple_choice'
  ) {
    return 'mcq';
  }

  const validV1 = ['mcq', 'tfng', 'ynng', 'fill_blank', 'matching', 'short_answer'];
  return validV1.includes(lower) ? lower : 'mcq';
}

export function normalizeQuestionOptions(
  options: any[] | undefined,
): Array<{ id: string; label: string; text: string }> | undefined {
  if (!options || !Array.isArray(options) || options.length === 0) {
    return undefined;
  }
  return options.map((opt: any, idx: number) => {
    if (typeof opt === 'string') {
      return {
        id: opt,
        label: opt,
        text: opt,
      };
    }
    const raw = typeof opt.toObject === 'function' ? opt.toObject() : opt;
    const id = String(raw.id ?? raw.key ?? raw._id ?? idx);
    const label = String(raw.label ?? raw.key ?? raw.text ?? id);
    const text = String(raw.text ?? raw.label ?? id);
    return {
      id,
      label,
      text,
    };
  });
}

export function isMultiSelectQuestionType(type: string | undefined): boolean {
  if (!type) return false;
  const upper = String(type).toUpperCase().trim();
  return upper === 'MULTIPLE_CHOICE_MULTIPLE' || upper === 'MCQ_MULTIPLE';
}

function parseMultiSelectAnswer(studentAnswer: any): string[] {
  if (Array.isArray(studentAnswer)) {
    return studentAnswer.map((s) => normalizeText(String(s), false)).filter(Boolean);
  }
  if (typeof studentAnswer === 'string') {
    const trimmed = studentAnswer.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map((s) => normalizeText(String(s), false)).filter(Boolean);
        }
      } catch {
        // Fall through to delimiter/single parsing
      }
    }
    if (trimmed.includes(',')) {
      return trimmed
        .split(',')
        .map((s) => normalizeText(s, false))
        .filter(Boolean);
    }
    return [normalizeText(trimmed, false)];
  }
  return [];
}

export function gradeExamQuestion(
  type: string,
  studentAnswer: any,
  gradingSpec: any,
  points = 1,
): { isCorrect: boolean; awardedPoints: number } {
  if (!gradingSpec || !gradingSpec.acceptedKeys || gradingSpec.acceptedKeys.length === 0) {
    return { isCorrect: false, awardedPoints: 0 };
  }

  const acceptedKeys: string[] = gradingSpec.acceptedKeys;
  const caseSensitive = Boolean(gradingSpec.caseSensitive);

  if (isMultiSelectQuestionType(type)) {
    const expectedSet = new Set(
      acceptedKeys.map((k) => normalizeText(String(k), false)).filter(Boolean),
    );
    const studentSet = new Set(parseMultiSelectAnswer(studentAnswer));
    const isCorrect =
      expectedSet.size > 0 &&
      expectedSet.size === studentSet.size &&
      Array.from(studentSet).every((item) => expectedSet.has(item));

    return {
      isCorrect,
      awardedPoints: isCorrect ? points : 0,
    };
  }

  const normType = normalizeQuestionType(type);
  const valStr = typeof studentAnswer === 'string' ? studentAnswer : String(studentAnswer || '');

  let isCorrect = false;

  switch (normType) {
    case 'mcq':
    case 'matching': {
      const normalizedStudent = normalizeText(valStr, false);
      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, false) === normalizedStudent,
      );
      break;
    }

    case 'tfng':
    case 'ynng': {
      const normalizedStudent = normalizeTFNG(valStr);
      isCorrect = acceptedKeys.some(
        (key) => normalizeTFNG(key) === normalizedStudent,
      );
      break;
    }

    case 'fill_blank':
    case 'short_answer': {
      const normalizedStudent = normalizeText(valStr, caseSensitive);
      if (gradingSpec.maxWords && gradingSpec.maxWords > 0) {
        const words = normalizedStudent.split(' ').filter(Boolean);
        if (words.length > gradingSpec.maxWords) {
          return { isCorrect: false, awardedPoints: 0 };
        }
      }
      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, caseSensitive) === normalizedStudent,
      );
      break;
    }

    default: {
      const normalizedStudent = normalizeText(valStr, caseSensitive);
      isCorrect = acceptedKeys.some(
        (key) => normalizeText(key, caseSensitive) === normalizedStudent,
      );
      break;
    }
  }

  return {
    isCorrect,
    awardedPoints: isCorrect ? points : 0,
  };
}

@Injectable()
export class SubmissionsService {
  constructor(
    @InjectModel(Submission.name) private submissionModel: Model<SubmissionDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
    @InjectConnection() private connection: Connection,
  ) {}

  async submit(assignmentId: string, dto: CreateSubmissionDto, student: UserDocument) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can submit assignments');
    }

    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    // Accept PUBLISHED or SCHEDULED (time-based: opened when now >= openAt)
    const isPublishedOrOpen =
      assignment.status === AssignmentStatus.PUBLISHED ||
      assignment.status === AssignmentStatus.SCHEDULED ||
      assignment.status === AssignmentStatus.AVAILABLE ||
      String(assignment.status).toLowerCase() === 'published' ||
      String(assignment.status).toLowerCase() === 'scheduled' ||
      String(assignment.status).toLowerCase() === 'available';
    if (!isPublishedOrOpen) {
      throw new BadRequestException('This assignment is not active');
    }

    const studentAssignment = await this.studentAssignmentModel
      .findOne({
        assignmentId: assignment._id,
        studentId: student._id,
      })
      .exec();

    if (!studentAssignment) {
      throw new ForbiddenException('You are not assigned to this assignment');
    }

    const nowMs = Date.now();
    if (assignment.openAt && nowMs < new Date(assignment.openAt).getTime()) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'Forbidden',
        code: 'ASSIGNMENT_NOT_YET_AVAILABLE',
        message: `Bài tập chưa đến giờ mở. Thời gian mở bài: ${formatVnDateTime(assignment.openAt)} (06:00 AM).`,
        availableAt: assignment.openAt,
        availableAtVn: formatVnDateTime(assignment.openAt),
      });
    }

    const effectiveDeadline = studentAssignment.effectiveDeadlineAt || assignment.deadlineAt;
    if (effectiveDeadline && nowMs >= new Date(effectiveDeadline).getTime()) {
      throw new BadRequestException({
        statusCode: 400,
        error: 'BadRequest',
        code: 'ASSIGNMENT_EXPIRED',
        message: `Thời hạn làm bài tập đã kết thúc vào ${formatVnDateTime(effectiveDeadline)} (06:00 AM hôm sau).`,
        deadlineAt: effectiveDeadline,
        deadlineAtVn: formatVnDateTime(effectiveDeadline),
      });
    }

    // Check existing submissions count
    const existingSubmissions = await this.submissionModel
      .find({ studentAssignmentId: studentAssignment._id })
      .sort({ attemptNo: 1 })
      .exec();

    const attemptCount = existingSubmissions.length;
    const attemptNo = attemptCount + 1;

    if (!assignment.allowRetake && attemptCount >= 1) {
      throw new BadRequestException('Retakes are not allowed for this assignment');
    }

    if (assignment.maxAttempts && attemptNo > assignment.maxAttempts) {
      throw new BadRequestException('Maximum attempt limit reached');
    }

    const snapshot = assignment.exerciseSnapshot;
    if (!snapshot || !snapshot.questions || snapshot.questions.length === 0) {
      throw new BadRequestException('Exercise questions not found in snapshot');
    }

    // Auto-grading engine
    const studentAnswerMap = new Map<string, any>();
    for (const ans of dto.answers) {
      studentAnswerMap.set(ans.questionId, ans.value ?? '');
    }

    let earnedPoints = 0;
    let totalPossiblePoints = 0;
    let correctCount = 0;

    const submissionAnswers: { questionId: string; value: string; awardedPoints: number }[] = [];

    for (const rawQ of snapshot.questions) {
      const q = rawQ as any;
      const qPoints = q.points !== undefined && q.points > 0 ? q.points : 1;
      totalPossiblePoints += qPoints;

      const qId = String(
        q.questionId || (q.number !== undefined ? String(q.number) : undefined) || q.id || ''
      );
      const rawVal =
        studentAnswerMap.get(qId) ??
        (q.questionId ? studentAnswerMap.get(q.questionId) : undefined) ??
        '';
      const spec = q.answerSpecification;
      const grading = q.grading;
      let isCorrect = false;

      // 1. If ExamTest v2 grading specification with acceptedKeys exists:
      if (grading && grading.acceptedKeys && grading.acceptedKeys.length > 0) {
        const gradeRes = gradeExamQuestion(q.type, rawVal, grading, qPoints);
        isCorrect = gradeRes.isCorrect;
      }
      // 2. Otherwise legacy answerSpecification:
      else if (spec) {
        const correctKey = spec.correctKey;
        const acceptedAnswers = spec.acceptedAnswers || [];
        if (isMultiSelectQuestionType(q.type)) {
          const keys =
            acceptedAnswers.length > 0
              ? acceptedAnswers
              : correctKey
                ? String(correctKey)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean)
                : [];
          if (keys.length > 0) {
            isCorrect = gradeExamQuestion(q.type, rawVal, { acceptedKeys: keys }, qPoints).isCorrect;
          }
        } else {
          const normType = normalizeQuestionType(q.type);

          switch (normType) {
            case 'mcq':
            case 'matching':
              if (correctKey) {
                isCorrect =
                  normalizeText(String(rawVal ?? ''), false) === normalizeText(correctKey, false);
              }
              break;

            case 'tfng':
            case 'ynng':
              if (correctKey) {
                isCorrect = normalizeTFNG(String(rawVal ?? '')) === normalizeTFNG(correctKey);
              }
              break;

            case 'fill_blank':
            case 'short_answer':
              if (acceptedAnswers && acceptedAnswers.length > 0) {
                const caseSensitive = Boolean(spec.caseSensitive);
                const normalizedInput = normalizeText(String(rawVal ?? ''), caseSensitive);
                isCorrect = acceptedAnswers.some(
                  (acc: string) => normalizeText(acc, caseSensitive) === normalizedInput,
                );
              } else if (correctKey) {
                isCorrect =
                  normalizeText(String(rawVal ?? ''), false) === normalizeText(correctKey, false);
              }
              break;

            default:
              break;
          }
        }
      }

      const awardedPoints = isCorrect ? qPoints : 0;
      if (isCorrect) {
        correctCount++;
        earnedPoints += awardedPoints;
      }

      submissionAnswers.push({
        questionId: qId || q.questionId,
        value:
          Array.isArray(rawVal) || (typeof rawVal === 'object' && rawVal !== null)
            ? JSON.stringify(rawVal)
            : String(rawVal ?? ''),
        awardedPoints,
      });
    }

    // Exact raw percentage: unrounded comparison for pass threshold
    const rawScorePercent = totalPossiblePoints > 0 ? (earnedPoints / totalPossiblePoints) * 100 : 0;
    const passThreshold = assignment.targetScorePercent ?? snapshot.passScore ?? 70;

    // Strict threshold check: compare against assignment.targetScorePercent ?? snapshot.passScore ?? 70
    const isPassed = rawScorePercent >= passThreshold;
    const displayScorePercent = Math.round(rawScorePercent * 100) / 100;

    const alreadyPassedBefore =
      Boolean(studentAssignment.isTargetAchieved) ||
      studentAssignment.status === StudentAssignmentStatus.PASSED ||
      existingSubmissions.some((s) => s.isPassed);

    const now = new Date();

    // Perform database writes atomically in a transaction where possible
    let submission: SubmissionDocument;
    const session = await this.connection.startSession();

    try {
      await session.withTransaction(async () => {
        const sub = new this.submissionModel({
          studentAssignmentId: studentAssignment._id,
          assignmentId: assignment._id,
          studentId: student._id,
          attemptNo,
          answers: submissionAnswers,
          scorePercent: displayScorePercent,
          correctCount,
          totalQuestions: snapshot.questions.length,
          isPassed,
          submittedAt: now,
          exerciseVersion: assignment.exerciseVersion,
        });

        submission = await sub.save({ session });

        // Update student assignment record
        studentAssignment.attemptsCount = attemptNo;
        studentAssignment.lastSubmittedAt = now;
        studentAssignment.bestScore = Math.max(
          studentAssignment.bestScore || 0,
          displayScorePercent,
        );

        if (isPassed || alreadyPassedBefore) {
          studentAssignment.status = StudentAssignmentStatus.PASSED;
          studentAssignment.isTargetAchieved = true;
          if (!studentAssignment.passedAt) {
            studentAssignment.passedAt = now;
          }
        } else {
          studentAssignment.status = StudentAssignmentStatus.SUBMITTED;
        }

        await studentAssignment.save({ session });
      });
    } catch (err: any) {
      if (err.code === 11000) {
        throw new ConflictException(
          'A concurrent submission for this attempt is already recorded. Please reload.',
        );
      }
      throw err;
    } finally {
      await session.endSession();
    }

    // Build immediate response: Never reveal correctKey or explanation here!
    return this.formatSubmissionResult(submission!, snapshot);
  }

  async getSubmissionById(id: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Submission not found');
    }

    const submission = await this.submissionModel.findById(id).exec();
    if (!submission) {
      throw new NotFoundException('Submission not found');
    }

    const assignment = await this.assignmentModel
      .findById(submission.assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    if (actor.role === UserRole.STUDENT) {
      if (extractObjectId(submission.studentId) !== extractObjectId(actor._id)) {
        throw new ForbiddenException('You can only view your own submissions');
      }
      // Never reveal correct keys in general submission detail
      return this.formatSubmissionResult(submission, assignment.exerciseSnapshot);
    }

    // Teacher / Admin: verify course ownership
    const course = await this.courseModel.findById(assignment.courseId).exec();
    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    // Teacher/Admin can see answers
    return this.formatSubmissionResult(submission, assignment.exerciseSnapshot, true);
  }

  async getAnswerKeys(assignmentId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const snapshot = assignment.exerciseSnapshot;
    if (!snapshot || !snapshot.questions) {
      throw new NotFoundException('Exercise questions not found');
    }

    if (actor.role === UserRole.STUDENT) {
      const studentAssignment = await this.studentAssignmentModel
        .findOne({
          assignmentId: assignment._id,
          studentId: actor._id,
        })
        .exec();

      if (!studentAssignment) {
        throw new ForbiddenException('You are not assigned to this assignment');
      }

      const passedSubmission = await this.submissionModel
        .findOne({
          studentAssignmentId: studentAssignment._id,
          isPassed: true,
        })
        .exec();

      const hasPassed =
        Boolean(studentAssignment.isTargetAchieved) ||
        studentAssignment.status === StudentAssignmentStatus.PASSED ||
        Boolean(passedSubmission);

      if (!hasPassed) {
        const targetScore = assignment.targetScorePercent ?? snapshot.passScore ?? 70;
        throw new ForbiddenException(
          `Answer keys and explanations are locked until you achieve a PASS score (>= ${targetScore}%)`,
        );
      }
    } else if (actor.role === UserRole.TEACHER) {
      const course = await this.courseModel.findById(assignment.courseId).exec();
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    // Return unlocked answer keys
    return {
      assignmentId: extractObjectId(assignment._id),
      exerciseTitle: snapshot.title,
      exerciseType: snapshot.type,
      passScore: snapshot.passScore,
      questions: snapshot.questions.map((q: any) => ({
        questionId: q.questionId,
        type: q.type,
        prompt: q.prompt,
        options: q.options,
        points: q.points,
        answerSpecification: q.answerSpecification,
        explanation: q.explanation,
      })),
    };
  }

  async findMySubmissions(assignmentId: string, student: UserDocument) {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const studentAssignment = await this.studentAssignmentModel
      .findOne({
        assignmentId: new Types.ObjectId(assignmentId),
        studentId: student._id,
      })
      .exec();

    if (!studentAssignment) {
      throw new ForbiddenException('You are not assigned to this assignment');
    }

    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    const submissions = await this.submissionModel
      .find({ studentAssignmentId: studentAssignment._id })
      .sort({ attemptNo: 1 })
      .exec();

    return submissions.map((s) =>
      this.formatSubmissionResult(s, assignment?.exerciseSnapshot, false),
    );
  }

  async findAllForAssignment(
    assignmentId: string,
    query: SubmissionQueryDto,
    actor: UserDocument,
  ) {
    if (!Types.ObjectId.isValid(assignmentId)) {
      throw new NotFoundException('Assignment not found');
    }

    const assignment = await this.assignmentModel
      .findById(assignmentId)
      .select('+exerciseSnapshot')
      .exec();

    if (!assignment) {
      throw new NotFoundException('Assignment not found');
    }

    const course = await this.courseModel.findById(assignment.courseId).exec();

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    } else if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot view all assignment submissions');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = { assignmentId: assignment._id };
    if (query.studentAssignmentId && Types.ObjectId.isValid(query.studentAssignmentId)) {
      filter.studentAssignmentId = new Types.ObjectId(query.studentAssignmentId);
    }

    const [docs, total] = await Promise.all([
      this.submissionModel
        .find(filter)
        .populate('studentId', 'name fullName email avatar')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ submittedAt: -1 })
        .exec(),
      this.submissionModel.countDocuments(filter).exec(),
    ]);

    const items = docs.map((doc) =>
      this.formatSubmissionResult(doc, assignment.exerciseSnapshot, true),
    );

    return {
      items,
      total,
      page,
      limit,
    };
  }

  private formatSubmissionResult(
    submission: SubmissionDocument,
    snapshot: any,
    includeAnswers = false,
  ) {
    const questionMap = new Map<string, any>();
    if (snapshot && snapshot.questions) {
      for (const q of snapshot.questions) {
        questionMap.set(q.questionId, q);
      }
    }

    const questionsFeedback = submission.answers.map((ans) => {
      const q = questionMap.get(ans.questionId);
      const isCorrect = (ans.awardedPoints || 0) > 0;

      const item: any = {
        questionId: ans.questionId,
        studentAnswer: ans.value,
        awardedPoints: ans.awardedPoints,
        isCorrect,
      };

      if (q) {
        item.prompt = q.prompt;
        item.type = q.type;
        item.points = q.points;
      }

      if (includeAnswers && q) {
        item.answerSpecification = q.answerSpecification;
        item.explanation = q.explanation;
      }

      return item;
    });

    return {
      id: extractObjectId(submission._id),
      submissionId: extractObjectId(submission._id),
      studentAssignmentId: extractObjectId(submission.studentAssignmentId),
      assignmentId: extractObjectId(submission.assignmentId),
      studentId: extractObjectId(submission.studentId),
      attemptNo: submission.attemptNo,
      scorePercent: submission.scorePercent,
      score: submission.scorePercent,
      correctCount: submission.correctCount,
      totalQuestions: submission.totalQuestions,
      isPassed: submission.isPassed,
      passed: Boolean(submission.isPassed),
      bestScore: submission.scorePercent,
      answerReviewUnlocked: Boolean(submission.isPassed),
      translationAvailable: Boolean(submission.isPassed),
      submittedAt: submission.submittedAt ? new Date(submission.submittedAt).toISOString() : new Date().toISOString(),
      exerciseVersion: submission.exerciseVersion,
      feedback: questionsFeedback,
    };
  }
}
