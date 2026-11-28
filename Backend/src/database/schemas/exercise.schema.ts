import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ExerciseStatus, ExerciseType, QuestionType } from './enums';

// Subdocument: individual option in multiple choice
@Schema({ _id: false })
export class AnswerOption {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  text: string;
}

// Subdocument: answer specification (varies by question type)
@Schema({ _id: false })
export class AnswerSpecification {
  /** For multiple_choice, true_false_not_given, yes_no_not_given, matching */
  @Prop()
  correctKey?: string;

  /** For fill_blank, short_answer */
  @Prop({ type: [String] })
  acceptedAnswers?: string[];

  /** Case sensitive matching for short_answer */
  @Prop({ default: false })
  caseSensitive?: boolean;
}

// Subdocument: a single question within an exercise
@Schema({ _id: false })
export class Question {
  @Prop({ required: true })
  questionId: string; // stable identifier (uuid)

  @Prop({
    type: String,
    enum: Object.values(QuestionType),
    required: true,
  })
  type: QuestionType;

  @Prop({ required: true })
  prompt: string;

  @Prop({ type: [{ key: String, text: String }], default: undefined })
  options?: AnswerOption[];

  /** select:false does NOT protect nested objects — use response mapper */
  @Prop({ type: Object, required: true, select: false })
  answerSpecification: AnswerSpecification;

  @Prop({ required: true, min: 0 })
  points: number;

  @Prop()
  explanation?: string;
}

export const QuestionSchema = SchemaFactory.createForClass(Question);

export type ExerciseDocument = Exercise & Document;

@Schema({ timestamps: true, collection: 'exercises' })
export class Exercise {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(ExerciseType),
    required: true,
  })
  type: ExerciseType;

  /** Passage text for reading exercises */
  @Prop()
  passage?: string;

  /** Audio file metadata keys */
  @Prop({ type: [{ objectKey: String, url: String, durationSeconds: Number }], default: undefined })
  audioAssets?: { objectKey: string; url?: string; durationSeconds?: number }[];

  @Prop({ type: [QuestionSchema], required: true, default: [] })
  questions: Question[];

  @Prop({ default: 70, min: 0, max: 100 })
  passScore: number;

  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  @Prop({
    type: String,
    enum: Object.values(ExerciseStatus),
    default: ExerciseStatus.DRAFT,
  })
  status: ExerciseStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ExerciseSchema = SchemaFactory.createForClass(Exercise);
ExerciseSchema.index({ type: 1, status: 1 });
ExerciseSchema.index({ createdBy: 1 });

