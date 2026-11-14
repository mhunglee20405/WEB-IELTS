import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AttemptStatus, ExamMode, ExamSkill } from './enums';

export type ExamAttemptDocument = ExamAttempt & Document;

@Schema({ timestamps: true, collection: 'exam_attempts' })
export class ExamAttempt {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ExamTest', required: true })
  testId: Types.ObjectId;

  /**
   * Snapshot of ExamTest.version at attempt creation time.
   * Allows grading against the question set that was active when
   * the student started, even after the test is updated.
   */
  @Prop({ required: true })
  exerciseVersion: number;

  /** Populated when the attempt is linked to an Assignment */
  @Prop({ type: Types.ObjectId, ref: 'Assignment' })
  assignmentId?: Types.ObjectId;

  /** Populated when the attempt is linked to a StudentAssignment */
  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment' })
  studentAssignmentId?: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(ExamSkill),
    required: true,
  })
  skill: ExamSkill;

  @Prop({
    type: String,
    enum: Object.values(ExamMode),
    required: true,
  })
  mode: ExamMode;

  /**
   * When mode=PART: the ObjectId (string representation) of the ExamPart
   * the student is attempting. Null for FULL mode.
   */
  @Prop({ type: String, default: null })
  partId: string | null;

  @Prop({
    type: String,
    enum: Object.values(AttemptStatus),
    default: AttemptStatus.IN_PROGRESS,
  })
  status: AttemptStatus;

  @Prop({ required: true })
  startedAt: Date;

  /** Absolute wall-clock time the attempt expires (auto-submitted if not done) */
  @Prop()
  expiresAt?: Date;

  @Prop()
  submittedAt?: Date;

  @Prop()
  lastSavedAt?: Date;

  /**
   * Monotonically-increasing counter; incremented on every PUT /answers call.
   * Enables optimistic concurrency checks.
   */
  @Prop({ default: 0 })
  answersRevision: number;

  /**
   * The question numbers (as strings) in scope for this attempt.
   * Derived from the test's parts / partId at creation time.
   */
  @Prop({ type: [String], default: [] })
  scopeQuestionIds: string[];

  @Prop({ type: [String], default: [] })
  flaggedQuestionIds?: string[];

  /**
   * Student's saved answers keyed by question number (string).
   * Value type varies by question type (string | string[]).
   */
  @Prop({ type: Map, of: Object, default: {} })
  savedAnswers: Map<string, unknown>;

  /**
   * Client-supplied idempotency key (UUID v4) to prevent duplicate attempts
   * from network retries. Sparse-unique so it can be absent on legacy docs.
   */
  @Prop({ type: String })
  idempotencyKey?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ExamAttemptSchema = SchemaFactory.createForClass(ExamAttempt);

ExamAttemptSchema.index({ studentId: 1, status: 1 });
ExamAttemptSchema.index({ testId: 1, studentId: 1 });
ExamAttemptSchema.index(
  { idempotencyKey: 1 },
  { unique: true, sparse: true },
);
