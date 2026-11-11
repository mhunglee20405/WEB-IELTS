import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TranslationSubmissionStatus } from './enums';

export type TranslationSubmissionDocument = TranslationSubmission & Document;

@Schema({ timestamps: true, collection: 'translation_submissions' })
export class TranslationSubmission {
  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment', required: true })
  studentAssignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Assignment', required: true })
  assignmentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  studentId: Types.ObjectId;

  @Prop({ required: true })
  translatedText: string;

  @Prop({
    type: String,
    enum: Object.values(TranslationSubmissionStatus),
    default: TranslationSubmissionStatus.DRAFT,
  })
  status: TranslationSubmissionStatus;

  @Prop()
  submittedAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  reviewedBy?: Types.ObjectId;

  @Prop()
  teacherComment?: string;

  @Prop()
  reviewedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TranslationSubmissionSchema = SchemaFactory.createForClass(TranslationSubmission);
TranslationSubmissionSchema.index({ studentAssignmentId: 1 }, { unique: true });
TranslationSubmissionSchema.index({ studentId: 1, status: 1 });

