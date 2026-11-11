import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';
import { EmailDeliveryStatus } from './enums';

export type EmailDeliveryDocument = EmailDelivery & Document;

@Schema({ timestamps: true, collection: 'email_deliveries' })
export class EmailDelivery {
  @Prop({ type: Types.ObjectId, ref: 'Notification' })
  notificationId?: Types.ObjectId;

  @Prop({ required: true, lowercase: true, trim: true })
  recipientEmail: string;

  @Prop({ required: true })
  templateKey: string;

  @Prop({ type: Object })
  payload?: Record<string, unknown>;

  @Prop({
    type: String,
    enum: Object.values(EmailDeliveryStatus),
    default: EmailDeliveryStatus.QUEUED,
    index: true,
  })
  status: EmailDeliveryStatus;

  @Prop()
  providerMessageId?: string;

  @Prop({ default: 0 })
  attemptCount: number;

  @Prop()
  sentAt?: Date;

  @Prop()
  errorMessage?: string;

  /** Idempotency key to prevent duplicate email sends */
  @Prop({ required: true })
  idempotencyKey: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const EmailDeliverySchema = SchemaFactory.createForClass(EmailDelivery);
EmailDeliverySchema.index({ idempotencyKey: 1 }, { unique: true });
EmailDeliverySchema.index({ status: 1, createdAt: -1 });

