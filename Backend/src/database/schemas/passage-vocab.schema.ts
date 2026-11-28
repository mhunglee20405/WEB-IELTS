import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PassageVocabDocument = PassageVocab & Document;

export enum VocabPartOfSpeech {
  NOUN = 'n',
  VERB = 'v',
  ADJ = 'adj',
  ADV = 'adv',
  PHRASE = 'phrase',
}

@Schema({ timestamps: true, collection: 'passage_vocabs' })
export class PassageVocab {
  /** ExamPart._id (as hex string) linking vocabulary directly to the Reading passage */
  @Prop({ required: true, trim: true, index: true })
  passageId: string;

  /** Parent ExamTest ObjectId when available */
  @Prop({ type: Types.ObjectId, ref: 'ExamTest', index: true })
  testId?: Types.ObjectId;

  /** 1-based Passage ordinal */
  @Prop({ min: 1 })
  partNumber?: number;

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

  /** Synonyms / paraphrase notes in IELTS Reading questions */
  @Prop({ trim: true })
  paraphraseNote?: string;

  /** Original context sentence extracted from the passage */
  @Prop({ trim: true })
  contextSentence?: string;

  @Prop({ default: 0, min: 0 })
  order: number;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PassageVocabSchema = SchemaFactory.createForClass(PassageVocab);

PassageVocabSchema.index({ passageId: 1, normalizedWord: 1 }, { unique: true });
PassageVocabSchema.index({ passageId: 1, order: 1, createdAt: 1 });
PassageVocabSchema.index({ testId: 1, passageId: 1 });
