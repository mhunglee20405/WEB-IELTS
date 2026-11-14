import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { CourseStatus, CourseType } from './enums';

export type CourseDocument = Course & Document;

@Schema({ timestamps: true, collection: 'courses' })
export class Course {
  @Prop({ required: true, uppercase: true, trim: true })
  code: string;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop()
  description?: string;

  @Prop({ required: true, min: 0, max: 9 })
  startBand: number;

  @Prop({ required: true, min: 0, max: 9 })
  targetBand: number;

  @Prop({
    type: String,
    enum: Object.values(CourseType),
    required: true,
  })
  type: CourseType;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  teacherId: Types.ObjectId;

  @Prop()
  startAt?: Date;

  @Prop()
  endAt?: Date;

  @Prop({
    type: String,
    enum: Object.values(CourseStatus),
    default: CourseStatus.DRAFT,
  })
  status: CourseStatus;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  createdBy: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const CourseSchema = SchemaFactory.createForClass(Course);
CourseSchema.index({ code: 1 }, { unique: true });
CourseSchema.index({ teacherId: 1, status: 1 });
CourseSchema.index({ status: 1 });

