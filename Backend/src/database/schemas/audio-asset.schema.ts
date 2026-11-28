import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type AudioAssetDocument = AudioAsset & Document;

export enum AudioAssetStatus {
  PENDING = 'PENDING',
  READY = 'READY',
}

export enum AudioStorageDriver {
  GRIDFS = 'gridfs',
  DISK = 'disk',
}

@Schema({ timestamps: true, collection: 'audio_assets' })
export class AudioAsset {
  @Prop({ required: true, unique: true, trim: true })
  objectKey: string;

  @Prop({ required: true, trim: true })
  filename: string;

  @Prop({ required: true, trim: true })
  mimeType: string;

  @Prop({ required: true, min: 1 })
  fileSize: number;

  @Prop({ min: 0 })
  actualSize?: number;

  @Prop({ min: 0 })
  durationSeconds?: number;

  @Prop({
    type: String,
    enum: Object.values(AudioAssetStatus),
    default: AudioAssetStatus.PENDING,
  })
  status: AudioAssetStatus;

  @Prop({
    type: String,
    enum: Object.values(AudioStorageDriver),
    default: AudioStorageDriver.GRIDFS,
  })
  storageDriver: AudioStorageDriver;

  @Prop({ type: Types.ObjectId })
  gridFsFileId?: Types.ObjectId;

  @Prop({ trim: true })
  localFilename?: string;

  @Prop({ required: true })
  expiresAt: Date;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  uploadedBy: Types.ObjectId;

  createdAt?: Date;
  updatedAt?: Date;
}

export const AudioAssetSchema = SchemaFactory.createForClass(AudioAsset);

AudioAssetSchema.index({ uploadedBy: 1, status: 1 });
AudioAssetSchema.index({ status: 1, expiresAt: 1 });
