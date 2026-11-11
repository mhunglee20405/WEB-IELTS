import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { v4 as uuidv4 } from 'uuid';
import { Exercise, ExerciseDocument } from 'src/database/schemas/exercise.schema';
import { Assignment, AssignmentDocument } from 'src/database/schemas/assignment.schema';
import {
  StudentAssignment,
  StudentAssignmentDocument,
} from 'src/database/schemas/student-assignment.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  ExerciseStatus,
  ExerciseType,
  QuestionType,
  UserRole,
} from 'src/database/schemas/enums';
import { CreateExerciseDto } from './dto/create-exercise.dto';
import { UpdateExerciseDto } from './dto/update-exercise.dto';
import { ExerciseQueryDto } from './dto/exercise-query.dto';
import { QuestionDto } from './dto/question.dto';
import { ExerciseMapper, FullExercise, SanitizedExercise } from './mappers/exercise.mapper';

export function validateQuestionSpecs(questions: QuestionDto[]): void {
  if (!questions || questions.length === 0) {
    throw new BadRequestException('Exercise must contain at least one question');
  }

  let totalPoints = 0;

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (q.points === undefined || q.points < 0) {
      throw new BadRequestException(`Question ${i + 1} must have points >= 0`);
    }
    totalPoints += q.points;

    const spec = q.answerSpecification;
    if (!spec) {
      throw new BadRequestException(`Question ${i + 1} must have answerSpecification`);
    }

    switch (q.type) {
      case QuestionType.MULTIPLE_CHOICE:
        if (!q.options || q.options.length < 2) {
          throw new BadRequestException(
            `Question ${i + 1} (Multiple Choice) must have at least 2 options`,
          );
        }
        if (!spec.correctKey || spec.correctKey.trim() === '') {
          throw new BadRequestException(
            `Question ${i + 1} (Multiple Choice) must specify a correctKey`,
          );
        }
        const hasKey = q.options.some((o) => o.key.trim().toLowerCase() === spec.correctKey!.trim().toLowerCase());
        if (!hasKey) {
          throw new BadRequestException(
            `Question ${i + 1} correctKey "${spec.correctKey}" does not match any provided options`,
          );
        }
        break;

      case QuestionType.TRUE_FALSE_NOT_GIVEN:
      case QuestionType.YES_NO_NOT_GIVEN:
      case QuestionType.MATCHING:
      case QuestionType.MATCHING_HEADINGS:
      case QuestionType.MATCHING_INFORMATION:
        if (!spec.correctKey || spec.correctKey.trim() === '') {
          throw new BadRequestException(
            `Question ${i + 1} (${q.type}) must specify a correctKey`,
          );
        }
        break;

      case QuestionType.FILL_BLANK:
      case QuestionType.SHORT_ANSWER:
      case QuestionType.SENTENCE_COMPLETION:
      case QuestionType.SUMMARY_COMPLETION:
        if (!spec.acceptedAnswers || spec.acceptedAnswers.length === 0) {
          throw new BadRequestException(
            `Question ${i + 1} (${q.type}) must provide at least one acceptedAnswer`,
          );
        }
        const hasValidAnswer = spec.acceptedAnswers.some((a) => a && a.trim() !== '');
        if (!hasValidAnswer) {
          throw new BadRequestException(
            `Question ${i + 1} (${q.type}) acceptedAnswers cannot be empty strings`,
          );
        }
        break;

      default:
        break;
    }
  }

  if (totalPoints <= 0) {
    throw new BadRequestException('Exercise total points must be greater than 0');
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

@Injectable()
export class ExercisesService {
  constructor(
    @InjectModel(Exercise.name) private exerciseModel: Model<ExerciseDocument>,
    @InjectModel(Assignment.name) private assignmentModel: Model<AssignmentDocument>,
    @InjectModel(StudentAssignment.name)
    private studentAssignmentModel: Model<StudentAssignmentDocument>,
  ) {}

  async create(dto: CreateExerciseDto, actor: UserDocument): Promise<FullExercise> {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot create exercises');
    }

    validateQuestionSpecs(dto.questions);

    // Auto-generate UUID for questions if not set
    const preparedQuestions = dto.questions.map((q) => ({
      ...q,
      questionId: q.questionId || uuidv4(),
    }));

    const exercise = new this.exerciseModel({
      title: dto.title.trim(),
      description: dto.description?.trim(),
      type: dto.type,
      passage: dto.passage,
      audioAssets: dto.audioAssets,
      questions: preparedQuestions,
      passScore: dto.passScore ?? 70,
      version: 1,
      status: dto.status ?? ExerciseStatus.DRAFT,
      createdBy: actor._id,
    });

    const saved = await exercise.save();
    return ExerciseMapper.forTeacher(saved);
  }

  async findAll(
    actor: UserDocument,
    query: ExerciseQueryDto,
  ): Promise<{ items: FullExercise[]; total: number; page: number; limit: number }> {
    if (actor.role === UserRole.STUDENT) {
      throw new ForbiddenException('Students cannot access exercise bank');
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const filter: Record<string, unknown> = {};

    if (actor.role === UserRole.TEACHER) {
      filter['$or'] = [
        { createdBy: actor._id },
        { status: ExerciseStatus.PUBLISHED },
      ];
    }

    if (query.type) filter['type'] = query.type;
    if (query.status) filter['status'] = query.status;
    if (query.search) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter['$and'] = [
        ...(filter['$and'] ? (filter['$and'] as any[]) : []),
        { $or: [{ title: regex }, { passage: regex }, { description: regex }] },
      ];
    }

    const [docs, total] = await Promise.all([
      this.exerciseModel
        .find(filter)
        .select('+questions.answerSpecification +questions.explanation')
        .skip((page - 1) * limit)
        .limit(limit)
        .sort({ createdAt: -1 })
        .exec(),
      this.exerciseModel.countDocuments(filter).exec(),
    ]);

    return {
      items: docs.map((d) => ExerciseMapper.forTeacher(d)),
      total,
      page,
      limit,
    };
  }

  async findById(
    id: string,
    actor: UserDocument,
  ): Promise<FullExercise | SanitizedExercise> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Exercise not found');

    const exercise = await this.exerciseModel
      .findById(id)
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    if (!exercise) throw new NotFoundException('Exercise not found');

    if (actor.role === UserRole.ADMIN) {
      return ExerciseMapper.forTeacher(exercise);
    }

    if (actor.role === UserRole.TEACHER) {
      const isOwner = (exercise.createdBy as Types.ObjectId).toHexString() === (actor._id as Types.ObjectId).toHexString();
      const isPublished = exercise.status === ExerciseStatus.PUBLISHED;

      if (!isOwner && !isPublished) {
        throw new ForbiddenException('You do not have access to this draft exercise');
      }
      return ExerciseMapper.forTeacher(exercise);
    }

    // Role is STUDENT: student can ONLY access if an assignment has been published and assigned to them!
    const matchingAssignments = await this.assignmentModel
      .find({ exerciseId: new Types.ObjectId(id) })
      .select('_id')
      .exec();

    if (matchingAssignments.length === 0) {
      throw new ForbiddenException('You do not have access to this exercise');
    }

    const assignmentIds = matchingAssignments.map((a) => a._id);
    const studentAssignment = await this.studentAssignmentModel
      .findOne({
        studentId: actor._id,
        assignmentId: { $in: assignmentIds },
      })
      .exec();

    if (!studentAssignment) {
      throw new ForbiddenException('You are not assigned this exercise');
    }

    // Return sanitized exercise: absolutely NO answer keys
    return ExerciseMapper.toSanitized(exercise);
  }

  async update(
    id: string,
    dto: UpdateExerciseDto,
    actor: UserDocument,
  ): Promise<FullExercise> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Exercise not found');

    const exercise = await this.exerciseModel
      .findById(id)
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    if (!exercise) throw new NotFoundException('Exercise not found');

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(exercise, actor._id as Types.ObjectId);
    }

    if (exercise.status === ExerciseStatus.ARCHIVED) {
      throw new UnprocessableEntityException('Cannot update an archived exercise');
    }

    const updatePayload: Record<string, unknown> = { ...dto };

    if (dto.questions) {
      validateQuestionSpecs(dto.questions);
      updatePayload['questions'] = dto.questions.map((q) => ({
        ...q,
        questionId: q.questionId || uuidv4(),
      }));
    }

    // If exercise is already PUBLISHED, bump the version to guarantee immutability for past assignments
    if (exercise.status === ExerciseStatus.PUBLISHED) {
      const isContentAltered =
        dto.title !== undefined ||
        dto.description !== undefined ||
        dto.questions !== undefined ||
        dto.passage !== undefined ||
        dto.audioAssets !== undefined ||
        dto.passScore !== undefined ||
        dto.type !== undefined;

      if (isContentAltered) {
        updatePayload['version'] = (exercise.version || 1) + 1;
      }
    }

    const updated = await this.exerciseModel
      .findByIdAndUpdate(id, { $set: updatePayload }, { new: true })
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    return ExerciseMapper.forTeacher(updated!);
  }

  async publish(id: string, actor: UserDocument): Promise<FullExercise> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Exercise not found');

    const exercise = await this.exerciseModel
      .findById(id)
      .select('+questions.answerSpecification +questions.explanation')
      .exec();

    if (!exercise) throw new NotFoundException('Exercise not found');

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(exercise, actor._id as Types.ObjectId);
    }

    if (exercise.status === ExerciseStatus.ARCHIVED) {
      throw new UnprocessableEntityException('Cannot publish an archived exercise');
    }

    if (!exercise.questions || exercise.questions.length === 0) {
      throw new BadRequestException('Cannot publish an exercise with no questions');
    }

    if (exercise.type === ExerciseType.READING && (!exercise.passage || exercise.passage.trim() === '')) {
      throw new BadRequestException('Reading exercise must have a passage before publishing');
    }

    exercise.status = ExerciseStatus.PUBLISHED;
    const published = await exercise.save();

    return ExerciseMapper.forTeacher(published);
  }

  async archive(id: string, actor: UserDocument): Promise<{ message: string; exercise: FullExercise }> {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('Exercise not found');

    const exercise = await this.exerciseModel.findById(id).exec();
    if (!exercise) throw new NotFoundException('Exercise not found');

    if (actor.role === UserRole.TEACHER) {
      this.assertTeacherOwns(exercise, actor._id as Types.ObjectId);
    }

    exercise.status = ExerciseStatus.ARCHIVED;
    const archived = await exercise.save();

    return {
      message: 'Exercise archived successfully',
      exercise: ExerciseMapper.forTeacher(archived),
    };
  }

  // Helper
  private assertTeacherOwns(exercise: ExerciseDocument, teacherId: Types.ObjectId): void {
    if ((exercise.createdBy as Types.ObjectId).toHexString() !== teacherId.toHexString()) {
      throw new ForbiddenException('You do not have permission to manage this exercise');
    }
  }
}

