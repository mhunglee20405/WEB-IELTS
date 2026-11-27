import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { FeedbackCategory, FeedbackStatus } from './enums';

export type FeedbackDocument = Feedback & Document;

/**
 * Anonymous learner/user feedback stored without any sender identity or metadata
 * (no studentId, email, fullName, ipAddress, or userAgent at the DB layer).
 */
@Schema({ timestamps: true, collection: 'feedbacks' })
export class Feedback {
  @Prop({
    type: String,
    enum: Object.values(FeedbackCategory),
    required: true,
  })
  category: FeedbackCategory;

  @Prop({ type: Number, min: 1, max: 5 })
  rating?: number;

  @Prop({ type: String, required: true, trim: true })
  content: string;

  @Prop({
    type: String,
    enum: Object.values(FeedbackStatus),
    default: FeedbackStatus.NEW,
  })
  status: FeedbackStatus;

  @Prop({ type: String, trim: true })
  adminNote?: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop({ type: Date })
  reviewedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const FeedbackSchema = SchemaFactory.createForClass(Feedback);
FeedbackSchema.index({ status: 1, createdAt: -1 });
FeedbackSchema.index({ category: 1, createdAt: -1 });
