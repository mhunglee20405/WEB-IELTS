import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { AssignmentStatus, ExerciseType } from './enums';
import { Question } from './exercise.schema';

export interface ExerciseSnapshot {
  title: string;
  type: ExerciseType;
  passage?: string;
  audioAssets?: { objectKey: string; url?: string; durationSeconds?: number }[];
  questions: Question[];
  passScore: number;
  version: number;
}

export type AssignmentDocument = Assignment & Document;

@Schema({ timestamps: true, collection: 'assignments' })
export class Assignment {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Exercise', required: true })
  exerciseId: Types.ObjectId;

  /** Snapshot of exercise version at assignment creation */
  @Prop({ required: true, min: 1 })
  exerciseVersion: number;

  /** Immutable exercise snapshot stored at assignment creation for deterministic grading */
  @Prop({ type: Object, select: false })
  exerciseSnapshot?: ExerciseSnapshot;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  assignedBy: Types.ObjectId;

  @Prop({ trim: true })
  title?: string;

  @Prop({ required: true })
  openAt: Date;

  @Prop({ required: true })
  deadlineAt: Date;

  @Prop({ default: false })
  allowRetake: boolean;

  @Prop({ min: 1 })
  maxAttempts?: number;

  @Prop({ type: String, enum: ['PART', 'FULL'], default: 'FULL' })
  requiredScope?: string;

  @Prop({ type: String })
  requiredPartId?: string;

  @Prop({ type: [String], default: ['PART', 'FULL'] })
  allowedModes?: string[];

  @Prop({ type: Number })
  durationSecondsOverride?: number;

  @Prop({
    type: String,
    enum: Object.values(AssignmentStatus),
    default: AssignmentStatus.DRAFT,
  })
  status: AssignmentStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AssignmentSchema = SchemaFactory.createForClass(Assignment);
AssignmentSchema.index({ courseId: 1, status: 1 });
AssignmentSchema.index({ deadlineAt: 1, status: 1 });
AssignmentSchema.index({ status: 1 });

