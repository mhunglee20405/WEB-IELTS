import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { ExtensionRequestStatus } from './enums';

export type ExtensionRequestDocument = ExtensionRequest & Document;

@Schema({ timestamps: true, collection: 'extension_requests' })
export class ExtensionRequest {
  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment', required: true, index: true })
  studentAssignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Course', required: true, index: true })
  courseId: Types.ObjectId;

  @Prop({ required: true })
  reason: string;

  @Prop({ required: true })
  requestedDeadlineAt: Date;

  @Prop({
    type: String,
    enum: Object.values(ExtensionRequestStatus),
    default: ExtensionRequestStatus.PENDING,
    index: true,
  })
  status: ExtensionRequestStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  reviewedAt?: Date;

  @Prop()
  reviewNote?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ExtensionRequestSchema = SchemaFactory.createForClass(ExtensionRequest);
// Index to count requests per month per student
ExtensionRequestSchema.index({ studentId: 1, createdAt: 1 });
ExtensionRequestSchema.index({ courseId: 1, status: 1 });
// Partial unique index: prevent multiple PENDING for same studentAssignment
ExtensionRequestSchema.index(
  { studentAssignmentId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: ExtensionRequestStatus.PENDING },
    name: 'unique_pending_per_student_assignment',
  },
);

