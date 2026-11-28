import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type ImageAssetDocument = ImageAsset & Document;

export enum ImageAssetStatus {
  PENDING = 'PENDING',
  READY = 'READY',
}

export enum ImageStorageDriver {
  GRIDFS = 'gridfs',
  DISK = 'disk',
}

@Schema({ timestamps: true, collection: 'image_assets' })
export class ImageAsset {
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

  @Prop({
    type: String,
    enum: Object.values(ImageAssetStatus),
    default: ImageAssetStatus.PENDING,
  })
  status: ImageAssetStatus;

  @Prop({
    type: String,
    enum: Object.values(ImageStorageDriver),
    default: ImageStorageDriver.GRIDFS,
  })
  storageDriver: ImageStorageDriver;

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

export const ImageAssetSchema = SchemaFactory.createForClass(ImageAsset);

ImageAssetSchema.index({ uploadedBy: 1, status: 1 });
ImageAssetSchema.index({ status: 1, expiresAt: 1 });
