import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { VocabPartOfSpeech } from './passage-vocab.schema';

export type UserVocabNotebookDocument = UserVocabNotebook & Document;

export enum VocabReviewStatus {
  LEARNING = 'learning',
  MASTERED = 'mastered',
}

@Schema({ timestamps: true, collection: 'user_vocab_notebooks' })
export class UserVocabNotebook {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  /** Optional Reading ExamPart._id (hex string) indicating source passage */
  @Prop({ trim: true })
  passageId?: string;

  /** Optional parent ExamTest ObjectId for direct navigation back to passage */
  @Prop({ type: Types.ObjectId, ref: 'ExamTest' })
  testId?: Types.ObjectId;

  @Prop({ trim: true })
  sourcePassageTitle?: string;

  @Prop({ trim: true })
  sourceTestTitle?: string;

  @Prop({ type: Types.ObjectId, ref: 'PassageVocab' })
  sourcePassageVocabId?: Types.ObjectId;

  @Prop({ required: true, trim: true })
  word: string;

  @Prop({ required: true, trim: true, lowercase: true })
  normalizedWord: string;

  @Prop({
    type: String,
    enum: Object.values(VocabPartOfSpeech),
    default: VocabPartOfSpeech.NOUN,
  })
  partOfSpeech: VocabPartOfSpeech;

  @Prop({ trim: true })
  ipa?: string;

  @Prop({ required: true, trim: true })
  meaningVi: string;

  @Prop({ trim: true })
  contextSentence?: string;

  @Prop({ trim: true })
  personalNote?: string;

  @Prop({ trim: true })
  paraphraseNote?: string;

  @Prop({
    type: String,
    enum: Object.values(VocabReviewStatus),
    default: VocabReviewStatus.LEARNING,
  })
  status: VocabReviewStatus;

  createdAt?: Date;
  updatedAt?: Date;
}

export const UserVocabNotebookSchema = SchemaFactory.createForClass(UserVocabNotebook);

// Prevent saving duplicate normalized words for the same student within the same passage
UserVocabNotebookSchema.index(
  { userId: 1, passageId: 1, normalizedWord: 1 },
  {
    unique: true,
    partialFilterExpression: { passageId: { $type: 'string' } },
  },
);

// Prevent saving duplicate standalone words (without passageId) for the same student
UserVocabNotebookSchema.index(
  { userId: 1, normalizedWord: 1 },
  {
    unique: true,
    partialFilterExpression: { passageId: { $exists: false } },
  },
);

UserVocabNotebookSchema.index({ userId: 1, status: 1, createdAt: -1 });
UserVocabNotebookSchema.index({ userId: 1, passageId: 1, createdAt: -1 });
