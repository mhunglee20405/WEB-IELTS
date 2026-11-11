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

    if (assignment.status !== AssignmentStatus.PUBLISHED) {
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
    const studentAnswerMap = new Map<string, string>();
    for (const ans of dto.answers) {
      studentAnswerMap.set(ans.questionId, ans.value || '');
    }

    let earnedPoints = 0;
    let totalPossiblePoints = 0;
    let correctCount = 0;

    const submissionAnswers: { questionId: string; value: string; awardedPoints: number }[] = [];

    for (const q of snapshot.questions) {
      const qPoints = q.points !== undefined && q.points > 0 ? q.points : 1;
      totalPossiblePoints += qPoints;

      const rawVal = studentAnswerMap.get(q.questionId) || '';
      const spec = q.answerSpecification;
      let isCorrect = false;

      if (spec) {
        switch (q.type) {
          case QuestionType.MULTIPLE_CHOICE:
          case QuestionType.MATCHING:
          case QuestionType.MATCHING_HEADINGS:
          case QuestionType.MATCHING_INFORMATION:
            if (spec.correctKey) {
              isCorrect =
                normalizeText(rawVal, false) === normalizeText(spec.correctKey, false);
            }
            break;

          case QuestionType.TRUE_FALSE_NOT_GIVEN:
          case QuestionType.YES_NO_NOT_GIVEN:
            if (spec.correctKey) {
              isCorrect = normalizeTFNG(rawVal) === normalizeTFNG(spec.correctKey);
            }
            break;

          case QuestionType.FILL_BLANK:
          case QuestionType.SHORT_ANSWER:
          case QuestionType.SENTENCE_COMPLETION:
          case QuestionType.SUMMARY_COMPLETION:
            if (spec.acceptedAnswers && spec.acceptedAnswers.length > 0) {
              const caseSensitive = Boolean(spec.caseSensitive);
              const normalizedInput = normalizeText(rawVal, caseSensitive);
              isCorrect = spec.acceptedAnswers.some(
                (acc) => normalizeText(acc, caseSensitive) === normalizedInput,
              );
            }
            break;

          default:
            break;
        }
      }

      const awardedPoints = isCorrect ? qPoints : 0;
      if (isCorrect) {
        correctCount++;
        earnedPoints += awardedPoints;
      }

      submissionAnswers.push({
        questionId: q.questionId,
        value: rawVal,
        awardedPoints,
      });
    }

    // Exact raw percentage: unrounded comparison for pass threshold
    const rawScorePercent = totalPossiblePoints > 0 ? (earnedPoints / totalPossiblePoints) * 100 : 0;
    const passThreshold = snapshot.passScore ?? 70;

    // Strict threshold check: exactly 70.0% is PASS, 69.999% is NOT PASS
    const isPassed = rawScorePercent >= passThreshold;
    const displayScorePercent = Math.round(rawScorePercent * 100) / 100;

    const alreadyPassedBefore =
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
        studentAssignment.lastSubmittedAt = now;
        studentAssignment.bestScore = Math.max(
          studentAssignment.bestScore || 0,
          displayScorePercent,
        );

        if (isPassed || alreadyPassedBefore) {
          studentAssignment.status = StudentAssignmentStatus.PASSED;
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
        studentAssignment.status === StudentAssignmentStatus.PASSED || Boolean(passedSubmission);

      if (!hasPassed) {
        throw new ForbiddenException(
          'Answer keys and explanations are locked until you achieve a PASS score (>= 70%)',
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
      studentAssignmentId: extractObjectId(submission.studentAssignmentId),
      assignmentId: extractObjectId(submission.assignmentId),
      studentId: extractObjectId(submission.studentId),
      attemptNo: submission.attemptNo,
      scorePercent: submission.scorePercent,
      correctCount: submission.correctCount,
      totalQuestions: submission.totalQuestions,
      isPassed: submission.isPassed,
      submittedAt: submission.submittedAt,
      exerciseVersion: submission.exerciseVersion,
      feedback: questionsFeedback,
    };
  }
}
