import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type StudentStudyDailyDocument = StudentStudyDaily & Document;

/**
 * Per-student daily active study time rollup keyed by Vietnam calendar date (YYYY-MM-DD).
 */
@Schema({ timestamps: true, collection: 'student_study_daily' })
export class StudentStudyDaily {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ type: String, required: true })
  dateVn: string;

  @Prop({ type: Number, required: true, default: 0, min: 0 })
  studySeconds: number;

  @Prop({ type: Number, default: 0, min: 0 })
  heartbeatCount: number;

  @Prop({ type: Date, required: true })
  lastHeartbeatAt: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const StudentStudyDailySchema = SchemaFactory.createForClass(StudentStudyDaily);
StudentStudyDailySchema.index({ studentId: 1, dateVn: 1 }, { unique: true });
StudentStudyDailySchema.index({ dateVn: 1 });
