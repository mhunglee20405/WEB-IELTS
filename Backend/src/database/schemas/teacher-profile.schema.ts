import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TeacherProfileDocument = TeacherProfile & Document;

@Schema({ timestamps: true, collection: 'teacher_profiles' })
export class TeacherProfile {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  userId: Types.ObjectId;

  @Prop()
  specialization?: string;

  @Prop()
  bio?: string;

  @Prop({ trim: true })
  phone?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TeacherProfileSchema = SchemaFactory.createForClass(TeacherProfile);
TeacherProfileSchema.index({ userId: 1 }, { unique: true });
