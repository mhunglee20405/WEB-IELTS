import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EnrollmentStatus } from './enums';

@Schema({ _id: false })
export class EnrollmentHistoryEntry {
  @Prop({ type: String, enum: Object.values(EnrollmentStatus), required: true })
  status: EnrollmentStatus;

  @Prop({ required: true, default: () => new Date() })
  changedAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop()
  note?: string;
}

export const EnrollmentHistoryEntrySchema = SchemaFactory.createForClass(EnrollmentHistoryEntry);

export type EnrollmentDocument = Enrollment & Document;

@Schema({ timestamps: true, collection: 'enrollments' })
export class Enrollment {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(EnrollmentStatus),
    default: EnrollmentStatus.ACTIVE,
  })
  status: EnrollmentStatus;

  @Prop({ required: true, default: () => new Date() })
  joinedAt: Date;

  @Prop()
  leftAt?: Date;

  @Prop({ type: [EnrollmentHistoryEntrySchema], default: [] })
  history: EnrollmentHistoryEntry[];

  /** Set to true only for ACTIVE enrollments in ONE_TO_ONE courses to enforce atomic capacity via partial unique index */
  @Prop()
  isOneToOneActive?: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EnrollmentSchema = SchemaFactory.createForClass(Enrollment);
// Compound unique for active-record model
EnrollmentSchema.index({ courseId: 1, studentId: 1 }, { unique: true });
EnrollmentSchema.index({ studentId: 1, status: 1 });
EnrollmentSchema.index({ courseId: 1, status: 1 });
EnrollmentSchema.index(
  { courseId: 1 },
  {
    unique: true,
    partialFilterExpression: { isOneToOneActive: true },
    name: 'unique_active_one_to_one_course',
  },
);

