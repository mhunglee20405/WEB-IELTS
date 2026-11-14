import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type PenaltyTransactionDocument = PenaltyTransaction & Document;

@Schema({ timestamps: true, collection: 'penalty_transactions' })
export class PenaltyTransaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  studentId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'StudentAssignment', required: true, index: true })
  studentAssignmentId: Types.ObjectId;

  /** +1 for penalty, -1 for reversal */
  @Prop({ required: true })
  deltaPoints: number;

  @Prop({ required: true })
  reason: string;

  /** Idempotency key to prevent duplicate penalty transactions */
  @Prop({ required: true })
  idempotencyKey: string;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  actorId?: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'PenaltyTransaction' })
  reversedTransactionId?: Types.ObjectId;

  @Prop({ default: false, index: true })
  isReversed: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const PenaltyTransactionSchema = SchemaFactory.createForClass(PenaltyTransaction);
PenaltyTransactionSchema.index({ idempotencyKey: 1 }, { unique: true });
PenaltyTransactionSchema.index({ studentId: 1, createdAt: -1 });

