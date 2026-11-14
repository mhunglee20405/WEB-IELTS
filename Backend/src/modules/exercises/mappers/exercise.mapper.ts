import { ExerciseDocument } from 'src/database/schemas/exercise.schema';
import { ExerciseStatus, ExerciseType, QuestionType } from 'src/database/schemas/enums';
import { Types } from 'mongoose';

export interface SanitizedQuestion {
  questionId: string;
  type: QuestionType;
  prompt: string;
  options?: { key: string; text: string }[];
  points: number;
}

export interface SanitizedExercise {
  id: string;
  title: string;
  description?: string;
  type: ExerciseType;
  passage?: string;
  audioAssets?: { objectKey: string; url?: string; durationSeconds?: number }[];
  questions: SanitizedQuestion[];
  passScore: number;
  version: number;
  status: ExerciseStatus;
  createdBy?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface FullQuestion extends SanitizedQuestion {
  answerSpecification?: {
    correctKey?: string;
    acceptedAnswers?: string[];
    caseSensitive?: boolean;
  };
  explanation?: string;
}

export interface FullExercise extends Omit<SanitizedExercise, 'questions'> {
  questions: FullQuestion[];
}

export class ExerciseMapper {
  /**
   * Sanitizes exercise for student viewing:
   * COMPLETELY REMOVES answerSpecification and explanation.
   */
  static toSanitized(doc: any): SanitizedExercise {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const id = raw._id ? (raw._id instanceof Types.ObjectId ? raw._id.toHexString() : String(raw._id)) : raw.id;

    const questions: any[] = (raw.questions || []).map((q: any) => ({
      questionId: q.questionId || (q.number !== undefined ? String(q.number) : undefined),
      number: q.number,
      type: q.type,
      prompt: q.prompt,
      options: q.options ? q.options.map((opt: any) => ({ key: opt.key, text: opt.text })) : undefined,
      points: q.points,
    }));

    return {
      id,
      title: raw.title,
      description: raw.description,
      type: raw.type,
      passage: raw.passage,
      audioAssets: raw.audioAssets,
      questions,
      passScore: raw.passScore,
      version: raw.version,
      status: raw.status,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  /**
   * Returns full exercise details including answer keys for teachers and admins.
   */
  static forTeacher(doc: any): FullExercise {
    const raw = typeof doc.toObject === 'function' ? doc.toObject() : doc;
    const id = raw._id ? (raw._id instanceof Types.ObjectId ? raw._id.toHexString() : String(raw._id)) : raw.id;
    const createdBy = raw.createdBy
      ? raw.createdBy instanceof Types.ObjectId
        ? raw.createdBy.toHexString()
        : typeof raw.createdBy === 'object' && raw.createdBy._id
          ? String(raw.createdBy._id)
          : String(raw.createdBy)
      : undefined;

    const questions: FullQuestion[] = (raw.questions || []).map((q: any) => ({
      questionId: q.questionId,
      type: q.type,
      prompt: q.prompt,
      options: q.options ? q.options.map((opt: any) => ({ key: opt.key, text: opt.text })) : undefined,
      answerSpecification: q.answerSpecification,
      points: q.points,
      explanation: q.explanation,
    }));

    return {
      id,
      title: raw.title,
      description: raw.description,
      type: raw.type,
      passage: raw.passage,
      audioAssets: raw.audioAssets,
      questions,
      passScore: raw.passScore,
      version: raw.version,
      status: raw.status,
      createdBy,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

