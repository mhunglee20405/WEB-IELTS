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
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import { Course, CourseDocument } from 'src/database/schemas/course.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  AssignmentStatus,
  ExerciseType,
  TranslationSubmissionStatus,
  UserRole,
} from 'src/database/schemas/enums';
import { SubmitTranslationDto } from './dto/submit-translation.dto';
import { ReviewTranslationDto } from './dto/review-translation.dto';
import { TranslationQueryDto } from './dto/translation-query.dto';

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

@Injectable()
export class TranslationsService {
  constructor(
    @InjectModel(TranslationSubmission.name)
    private translationModel: Model<TranslationSubmissionDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(Course.name) private courseModel: Model<CourseDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
  ) {}

  async submit(assignmentId: string, dto: SubmitTranslationDto, student: UserDocument) {
    if (student.role !== UserRole.STUDENT) {
      throw new ForbiddenException('Only students can submit translation exercises');
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

    const snapshot = assignment.exerciseSnapshot;
    if (snapshot && snapshot.type !== ExerciseType.READING) {
      throw new BadRequestException('Translation exercises are only available for Reading assignments');
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

    const existing = await this.translationModel
      .findOne({ studentAssignmentId: studentAssignment._id })
      .exec();

    const status = dto.status || TranslationSubmissionStatus.SUBMITTED;
    const isSubmitted = status === TranslationSubmissionStatus.SUBMITTED;

    if (existing) {
      if (existing.status === TranslationSubmissionStatus.REVIEWED) {
        throw new BadRequestException('Cannot edit a translation that has already been reviewed by the teacher');
      }

      existing.translatedText = dto.translatedText;
      existing.status = status;
      if (isSubmitted) {
        existing.submittedAt = new Date();
      }
      await existing.save();
      return this.formatTranslation(existing, snapshot?.passage);
    }

    const created = new this.translationModel({
      studentAssignmentId: studentAssignment._id,
      assignmentId: assignment._id,
      studentId: student._id,
      translatedText: dto.translatedText,
      status,
      submittedAt: isSubmitted ? new Date() : undefined,
    });

    await created.save();
    return this.formatTranslation(created, snapshot?.passage);
  }

  async findMine(assignmentId: string, student: UserDocument) {
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

    const studentAssignment = await this.studentAssignmentModel
      .findOne({
        assignmentId: assignment._id,
        studentId: student._id,
      })
      .exec();

    if (!studentAssignment) {
      throw new ForbiddenException('You are not assigned to this assignment');
    }

    const submission = await this.translationModel
      .findOne({ studentAssignmentId: studentAssignment._id })
      .populate('reviewedBy', 'fullName email')
      .exec();

    if (!submission) {
      return {
        assignmentId,
        passage: assignment.exerciseSnapshot?.passage,
        translation: null,
      };
    }

    return this.formatTranslation(submission, assignment.exerciseSnapshot?.passage);
  }

  async findAllForAssignment(
    assignmentId: string,
    query: TranslationQueryDto,
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
      throw new ForbiddenException('Students cannot view all translation submissions');
    }

    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));

    const filter: Record<string, any> = { assignmentId: assignment._id };
    if (query.status) {
      filter.status = query.status;
    }

    const [docs, total] = await Promise.all([
      this.translationModel
        .find(filter)
        .populate('studentId', 'name fullName email avatar')
        .populate('reviewedBy', 'fullName email')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ submittedAt: -1 })
        .exec(),
      this.translationModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => this.formatTranslation(d, assignment.exerciseSnapshot?.passage)),
      total,
      page,
      limit,
    };
  }

  async review(id: string, dto: ReviewTranslationDto, actor: UserDocument) {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot review translations');
    }

    if (!Types.ObjectId.isValid(id)) {
      throw new NotFoundException('Translation submission not found');
    }

    const submission = await this.translationModel.findById(id).exec();
    if (!submission) {
      throw new NotFoundException('Translation submission not found');
    }

    const assignment = await this.assignmentModel.findById(submission.assignmentId).exec();
    if (!assignment) {
      throw new NotFoundException('Associated assignment not found');
    }

    const course = await this.courseModel.findById(assignment.courseId).exec();

    if (actor.role === UserRole.TEACHER) {
      const isTeacher = extractObjectId(course?.teacherId) === extractObjectId(actor._id);
      if (!isTeacher) {
        throw new ForbiddenException('You do not teach this course');
      }
    }

    submission.teacherComment = dto.teacherComment;
    submission.reviewedBy = actor._id as Types.ObjectId;
    submission.reviewedAt = new Date();
    submission.status = TranslationSubmissionStatus.REVIEWED;

    await submission.save();

    return this.formatTranslation(submission);
  }

  private formatTranslation(doc: TranslationSubmissionDocument, originalPassage?: string) {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const res: any = {
      id: extractObjectId(raw._id),
      studentAssignmentId: extractObjectId(raw.studentAssignmentId),
      assignmentId: extractObjectId(raw.assignmentId),
      studentId: extractObjectId(raw.studentId),
      student: raw.studentId && typeof raw.studentId === 'object' ? raw.studentId : undefined,
      translatedText: raw.translatedText,
      status: raw.status,
      submittedAt: raw.submittedAt,
      reviewedBy: raw.reviewedBy ? extractObjectId(raw.reviewedBy) : undefined,
      teacherComment: raw.teacherComment,
      reviewedAt: raw.reviewedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };

    if (originalPassage) {
      res.originalPassage = originalPassage;
    }

    return res;
  }
}

