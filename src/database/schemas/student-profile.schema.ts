import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentProfileDocument = StudentProfile & Document;

@Schema({ timestamps: true, collection: 'student_profiles' })
export class StudentProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop({ min: 0, max: 9 })
  currentBand?: number;

  @Prop({ min: 0, max: 9 })
  targetBand?: number;

  /** Cached penalty points — NOT authoritative. Sum of penalty_transactions is source of truth. */
  @Prop({ default: 0 })
  penaltyPointsCache: number;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentProfileSchema = SchemaFactory.createForClass(StudentProfile);
StudentProfileSchema.index({ userId: 1 }, { unique: true });