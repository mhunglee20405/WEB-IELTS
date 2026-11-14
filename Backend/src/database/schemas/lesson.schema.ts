import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { LessonStatus } from './enums';

export type LessonDocument = Lesson & Document;

@Schema({ timestamps: true, collection: 'lessons' })
export class Lesson {
  @Prop({ type: Types.ObjectId, ref: 'Course', required: true })
  courseId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  title: string;

  @Prop({ required: true })
  startAt: Date;

  @Prop({ required: true })
  endAt: Date;

  @Prop({ trim: true })
  meetUrl?: string;

  @Prop()
  content?: string;

  @Prop({
    type: String,
    enum: Object.values(LessonStatus),
    default: LessonStatus.SCHEDULED,
  })
  status: LessonStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const LessonSchema = SchemaFactory.createForClass(Lesson);
LessonSchema.index({ courseId: 1, startAt: 1 });
LessonSchema.index({ startAt: 1 });
LessonSchema.index({ status: 1 });

