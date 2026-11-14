import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import {
  ExamSkill,
  ExamMode,
  ExamPreset,
  ExamTestStatus,
  ExamQuestionType,
  PartType,
} from './enums';

// ─── Embedded: ExamOption ─────────────────────────────────────────────────────

@Schema({ _id: false })
export class ExamOption {
  @Prop({ required: true })
  key: string;

  @Prop({ required: true })
  text: string;
}

// ─── Embedded: ExamGrading (server-only, never sent to client) ────────────────

@Schema({ _id: false })
export class ExamGrading {
  /** Accepted answer keys / strings */
  @Prop({ type: [String] })
  acceptedKeys: string[];

  /** Whether matching is case-sensitive (for fill/completion types) */
  @Prop({ default: false })
  caseSensitive: boolean;

  /** Max word count for completion types */
  @Prop()
  maxWords?: number;
}

// ─── Embedded: ExamQuestion ───────────────────────────────────────────────────

@Schema({ _id: false })
export class ExamQuestion {
  /** Global question number within the test (1-based) */
  @Prop({ required: true })
  number: number;

  @Prop({ required: true })
  prompt: string;

  @Prop({
    type: String,
    enum: Object.values(ExamQuestionType),
    required: true,
  })
  type: ExamQuestionType;

  @Prop({ required: true, min: 0 })
  points: number;

  /** Multiple-choice / matching options */
  @Prop({ type: [{ key: String, text: String }], default: undefined })
  options?: ExamOption[];

  /**
   * Grading data — server-side only.
   * select:false on a nested schema is not enforced by Mongoose for
   * sub-documents, so we do NOT use select:false here; callers must
   * use a response-mapper to strip this before sending to clients.
   */
  @Prop({ type: Object })
  grading?: ExamGrading;
}

export const ExamQuestionSchema = SchemaFactory.createForClass(ExamQuestion);

// ─── Embedded: QuestionGroup ──────────────────────────────────────────────────

@Schema({ _id: true })
export class QuestionGroup {
  @Prop()
  title?: string;

  @Prop()
  instruction?: string;

  @Prop({
    type: String,
    enum: Object.values(ExamQuestionType),
    required: true,
  })
  type: ExamQuestionType;

  @Prop({ required: true })
  order: number;

  /** Shared answer options for the whole group (e.g. matching headings pool) */
  @Prop({ type: [{ key: String, text: String }], default: undefined })
  sharedOptions?: ExamOption[];

  /** Max words allowed (completion types) */
  @Prop()
  maxWords?: number;

  @Prop({ type: [ExamQuestionSchema], required: true, default: [] })
  questions: ExamQuestion[];
}

export const QuestionGroupSchema = SchemaFactory.createForClass(QuestionGroup);

// ─── Embedded: ExamPart ───────────────────────────────────────────────────────

@Schema({ _id: true })
export class ExamPart {
  /** 1-based position within the test */
  @Prop({ required: true })
  ordinal: number;

  @Prop({
    type: String,
    enum: Object.values(PartType),
    required: true,
  })
  type: PartType;

  @Prop({ required: true, trim: true })
  title: string;

  /** HTML passage / reading text (Reading tests) */
  @Prop()
  contentHtml?: string;

  /** Reference to an audio asset (Listening tests) */
  @Prop({ type: Types.ObjectId })
  audioAssetId?: Types.ObjectId;

  /** Time limit for this part in seconds (null = unlimited / follows fullDurationSeconds) */
  @Prop()
  durationSeconds?: number;

  @Prop({ type: [QuestionGroupSchema], required: true, default: [] })
  questionGroups: QuestionGroup[];
}

export const ExamPartSchema = SchemaFactory.createForClass(ExamPart);

// ─── Root: ExamTest ───────────────────────────────────────────────────────────

export type ExamTestDocument = ExamTest & Document;

@Schema({ timestamps: true, collection: 'exam_tests' })
export class ExamTest {
  @Prop({ required: true, trim: true })
  title: string;

  @Prop({
    type: String,
    enum: Object.values(ExamSkill),
    required: true,
  })
  skill: ExamSkill;

  @Prop({ trim: true })
  description?: string;

  @Prop({
    type: String,
    enum: Object.values(ExamPreset),
    default: ExamPreset.IELTS_ACADEMIC,
  })
  examPreset: ExamPreset;

  /** Which attempt modes are allowed for this test */
  @Prop({
    type: [String],
    enum: Object.values(ExamMode),
    default: [ExamMode.PART, ExamMode.FULL],
  })
  allowedModes: ExamMode[];

  /** Minimum score (%) to pass */
  @Prop({ default: 70, min: 0, max: 100 })
  passScore: number;

  /** Total duration in seconds for FULL mode */
  @Prop()
  fullDurationSeconds?: number;

  /** Whether passage-translation feature is enabled */
  @Prop({ default: false })
  translationEnabled: boolean;

  @Prop({ type: [ExamPartSchema], required: true, default: [] })
  parts: ExamPart[];

  @Prop({
    type: String,
    enum: Object.values(ExamTestStatus),
    default: ExamTestStatus.DRAFT,
  })
  status: ExamTestStatus;

  /** Incremented on every published change; ties to ExamAttempt.exerciseVersion */
  @Prop({ required: true, default: 1, min: 1 })
  version: number;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  @Prop()
  publishedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ExamTestSchema = SchemaFactory.createForClass(ExamTest);

ExamTestSchema.index({ createdBy: 1, status: 1 });
ExamTestSchema.index({ skill: 1, status: 1 });
