import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { TranslationSubmissionStatus } from './enums';

export type TranslationSubmissionDocument = TranslationSubmission & Document;

@Schema({ timestamps: true, collection: 'translation_submissions' })
export class TranslationSubmission {
  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment', required: false })
  studentAssignmentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Assignment', required: false })
  assignmentId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ExamTest', required: false })
  testId?: Types.ObjectId;

  @Prop({ type: String, required: false })
  passageId?: string;

  @Prop({ type: Number, required: false })
  exerciseVersion?: number;

  @Prop({ type: Types.ObjectId, ref: 'ExamAttempt', required: false })
  examAttemptId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'ExamAttempt', required: false })
  sourceAttemptId?: Types.ObjectId;

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
TranslationSubmissionSchema.index({ studentAssignmentId: 1, passageId: 1 }, { unique: true, sparse: true });
TranslationSubmissionSchema.index({ studentId: 1, testId: 1, passageId: 1 }, { unique: true, sparse: true });
TranslationSubmissionSchema.index({ studentId: 1, status: 1 });

