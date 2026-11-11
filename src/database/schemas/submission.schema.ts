import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

@Schema({ _id: false })
export class SubmissionAnswer {
  @Prop({ required: true })
  questionId: string;

  @Prop({ type: String, required: true })
  value: string;

  @Prop({ min: 0 })
  awardedPoints?: number;
}

export type SubmissionDocument = Submission & Document;

@Schema({ timestamps: true, collection: 'submissions' })
export class Submission {
  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment', required: true })
  studentAssignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Assignment', required: true })
  assignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true, min: 1 })
  attemptNo: number;

  @Prop({ type: [{ questionId: String, value: String, awardedPoints: Number }], default: [] })
  answers: SubmissionAnswer[];

  @Prop({ required: true, min: 0, max: 100 })
  scorePercent: number;

  @Prop({ required: true, min: 0 })
  correctCount: number;

  @Prop({ required: true, min: 0 })
  totalQuestions: number;

  @Prop({ required: true })
  isPassed: boolean;

  @Prop({ required: true, default: () => new Date() })
  submittedAt: Date;

  /** Version of the exercise snapshot used for grading */
  @Prop({ required: true, min: 1 })
  exerciseVersion: number;

  @Prop({ type: Types.ObjectId, ref: 'ExamAttempt' })
  examAttemptId?: Types.ObjectId;

  @Prop({ type: String, enum: ['PART', 'FULL'] })
  mode?: string;

  @Prop({ type: String })
  partId?: string;

  @Prop({ type: [String], default: [] })
  scopeQuestionIds?: string[];

  @Prop({ type: Number })
  earnedPoints?: number;

  @Prop({ type: Number })
  totalPoints?: number;

  createdAt?: Date;
  updatedAt?: Date;
}

export const SubmissionSchema = SchemaFactory.createForClass(Submission);
SubmissionSchema.index({ studentAssignmentId: 1, attemptNo: 1 }, { unique: true });
SubmissionSchema.index({ studentId: 1, assignmentId: 1 });

