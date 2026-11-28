import {
  Injectable,
  BadRequestException,
  NotFoundException,
  PayloadTooLargeException,
  Optional,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import mongoose, { Connection, Model, Types } from 'mongoose';
import {
  AudioAsset,
  AudioAssetDocument,
  AudioAssetStatus,
  AudioStorageDriver,
} from 'src/database/schemas/audio-asset.schema';
import {
  ImageAsset,
  ImageAssetDocument,
  ImageAssetStatus,
  ImageStorageDriver,
} from 'src/database/schemas/image-asset.schema';
import {
  AudioUploadCompleteDto,
  AudioUploadIntentDto,
  ImageUploadIntentDto,
} from './dto/media.dto';
import { UserDocument } from 'src/database/schemas/user.schema';
import * as fs from 'fs';
import * as path from 'path';

const MAX_AUDIO_BYTES = 50 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

function getMimeFromFilename(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.mp3')) return 'audio/mpeg';
  if (lower.endsWith('.wav')) return 'audio/wav';
  if (lower.endsWith('.m4a') || lower.endsWith('.mp4')) return 'audio/mp4';
  if (lower.endsWith('.aac')) return 'audio/aac';
  if (lower.endsWith('.ogg')) return 'audio/ogg';
  if (lower.endsWith('.webm')) return 'audio/webm';
  if (lower.endsWith('.flac')) return 'audio/flac';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  return 'application/octet-stream';
}

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    @InjectModel(AudioAsset.name)
    private readonly audioAssetModel: Model<AudioAssetDocument>,
    @InjectConnection()
    private readonly connection: Connection,
    @Optional()
    @InjectModel(ImageAsset.name)
    private readonly imageAssetModel?: Model<ImageAssetDocument>,
    @Optional()
    private readonly configService?: ConfigService,
  ) {}

  private getApiPrefix(): string {
    return (this.configService?.get<string>('apiPrefix') || 'api/v1').replace(/^\/+|\/+$/g, '');
  }

  private getUploadDir(subdir: 'audio' | 'images'): string {
    const base = this.configService?.get<string>('storage.localPath') || './uploads';
    return path.resolve(process.cwd(), base, subdir);
  }

  private getGridFsBucket(bucketName: 'audio_files' | 'image_files') {
    if (!this.connection?.db) {
      return null;
    }
    return new mongoose.mongo.GridFSBucket(this.connection.db as any, {
      bucketName,
    });
  }

  private buildApiMediaUrl(
    resource: 'audio' | 'images',
    subPath: string,
    requestOrigin?: string,
  ): string {
    const apiPrefix = this.getApiPrefix();
    const rel = `/${apiPrefix}/media/${resource}${subPath.startsWith('/') ? subPath : `/${subPath}`}`;
    if (requestOrigin) {
      return `${requestOrigin.replace(/\/+$/, '')}${rel}`;
    }
    return rel;
  }

  /**
   * Shared streaming upload helper writing binary request stream directly to MongoDB GridFS
   * (or local disk fallback) without buffering large files into Node.js RAM.
   */
  private async streamRequestToStorage(params: {
    req: any;
    bucketName: 'audio_files' | 'image_files';
    diskSubdir: 'audio' | 'images';
    objectKey: string;
    maxBytes: number;
    existingGridFsId?: Types.ObjectId;
    metadata: Record<string, string>;
  }): Promise<{
    useGridFs: boolean;
    gridFsFileId?: Types.ObjectId;
    localFilename?: string;
    receivedBytes: number;
  }> {
    const { req, bucketName, diskSubdir, objectKey, maxBytes, existingGridFsId, metadata } = params;
    const bucket = this.getGridFsBucket(bucketName);

    if (bucket) {
      if (existingGridFsId) {
        await bucket.delete(existingGridFsId).catch(() => undefined);
      }

      const uploadStream = bucket.openUploadStream(objectKey, { metadata });
      let receivedBytes = 0;
      let abortedForSize = false;

      await new Promise<void>((resolve, reject) => {
        req.on('data', (chunk: Buffer) => {
          receivedBytes += chunk.length;
          if (receivedBytes > maxBytes && !abortedForSize) {
            abortedForSize = true;
            req.unpipe(uploadStream);
            uploadStream.abort().catch(() => undefined);
            reject(
              new PayloadTooLargeException(
                `Uploaded file exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB`,
              ),
            );
          }
        });

        req.on('error', (err: Error) => {
          uploadStream.abort().catch(() => undefined);
          reject(err);
        });

        uploadStream.on('error', reject);
        uploadStream.on('finish', resolve);
        req.pipe(uploadStream);
      });

      if (receivedBytes <= 0) {
        await bucket.delete(uploadStream.id as Types.ObjectId).catch(() => undefined);
        throw new BadRequestException('Uploaded payload is empty');
      }

      return {
        useGridFs: true,
        gridFsFileId: uploadStream.id as Types.ObjectId,
        receivedBytes,
      };
    }

    const uploadsDir = this.getUploadDir(diskSubdir);
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    const targetPath = path.join(uploadsDir, objectKey);
    const writeStream = fs.createWriteStream(targetPath);

    let receivedBytes = 0;
    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        receivedBytes += chunk.length;
        if (receivedBytes > maxBytes) {
          req.unpipe(writeStream);
          writeStream.destroy();
          fs.unlink(targetPath, () => undefined);
          reject(
            new PayloadTooLargeException(
              `Uploaded file exceeds maximum size limit of ${Math.round(maxBytes / (1024 * 1024))}MB`,
            ),
          );
        }
      });
      req.on('error', reject);
      writeStream.on('error', reject);
      writeStream.on('finish', resolve);
      req.pipe(writeStream);
    });

    if (receivedBytes <= 0) {
      fs.unlink(targetPath, () => undefined);
      throw new BadRequestException('Uploaded payload is empty');
    }

    return {
      useGridFs: false,
      localFilename: objectKey,
      receivedBytes,
    };
  }

  async getPlaybackUrl(assetId: string, _actor: UserDocument, requestOrigin?: string) {
    if (!assetId || !assetId.trim()) {
      throw new BadRequestException('Asset ID is required');
    }

    const trimmed = assetId.trim();
    const id = trimmed.toLowerCase();
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();

    if (id.includes('section1') || id === 'audio-list-s1' || id === 'audio-part-1' || id === 'audio-1') {
      return { assetId: trimmed, streamUrl: '/audio/ielts-listening-section1.wav', mimeType: 'audio/wav', durationSeconds: 1800, expiresAt };
    }
    if (id.includes('section2') || id === 'audio-list-s2' || id === 'audio-part-2' || id === 'audio-2') {
      return { assetId: trimmed, streamUrl: '/audio/ielts-listening-section2.wav', mimeType: 'audio/wav', durationSeconds: 1800, expiresAt };
    }
    if (id.includes('section3') || id === 'audio-list-s3' || id === 'audio-part-3' || id === 'audio-3') {
      return { assetId: trimmed, streamUrl: '/audio/ielts-listening-section3.wav', mimeType: 'audio/wav', durationSeconds: 1800, expiresAt };
    }
    if (id.includes('section4') || id === 'audio-list-s4' || id === 'audio-part-4' || id === 'audio-4') {
      return { assetId: trimmed, streamUrl: '/audio/ielts-listening-section4.wav', mimeType: 'audio/wav', durationSeconds: 1800, expiresAt };
    }
    if (id.includes('sound-check') || id === 'sound_check') {
      return { assetId: trimmed, streamUrl: '/audio/sound-check.wav', mimeType: 'audio/wav', durationSeconds: 15, expiresAt };
    }
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/audio/')) {
      return { assetId: trimmed, streamUrl: trimmed, mimeType: getMimeFromFilename(trimmed), durationSeconds: 1800, expiresAt };
    }

    const asset = await this.audioAssetModel
      .findOne(
        Types.ObjectId.isValid(trimmed)
          ? { _id: new Types.ObjectId(trimmed) }
          : { objectKey: trimmed },
      )
      .exec();

    if (asset) {
      if (asset.status !== AudioAssetStatus.READY) {
        throw new BadRequestException('Audio upload has not completed yet.');
      }
      return {
        assetId: asset._id.toHexString(),
        streamUrl: this.buildApiMediaUrl('audio', `/stream/${encodeURIComponent(asset.objectKey)}`, requestOrigin),
        mimeType: asset.mimeType || getMimeFromFilename(asset.filename),
        durationSeconds: asset.durationSeconds ?? 0,
        expiresAt,
      };
    }

    const uploadsDir = this.getUploadDir('audio');
    if (fs.existsSync(uploadsDir)) {
      const exactPath = path.join(uploadsDir, trimmed.replace(/[^a-zA-Z0-9._-]/g, '_'));
      if (fs.existsSync(exactPath)) {
        const fname = path.basename(exactPath);
        return {
          assetId: trimmed,
          streamUrl: this.buildApiMediaUrl('audio', `/stream/${encodeURIComponent(fname)}`, requestOrigin),
          mimeType: getMimeFromFilename(fname),
          durationSeconds: 0,
          expiresAt,
        };
      }
      const prefixMatch = fs.readdirSync(uploadsDir).find((f) => f.startsWith(`${trimmed}-`));
      if (prefixMatch) {
        return {
          assetId: trimmed,
          streamUrl: this.buildApiMediaUrl('audio', `/stream/${encodeURIComponent(prefixMatch)}`, requestOrigin),
          mimeType: getMimeFromFilename(prefixMatch),
          durationSeconds: 0,
          expiresAt,
        };
      }
    }

    throw new NotFoundException('Audio asset not found');
  }

  async createUploadIntent(dto: AudioUploadIntentDto, actor: UserDocument, requestOrigin?: string) {
    if (dto.fileSize > MAX_AUDIO_BYTES) {
      throw new BadRequestException('Audio file exceeds the maximum size limit of 50MB');
    }

    const assetObjectId = new Types.ObjectId();
    const assetId = assetObjectId.toHexString();
    const cleanName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'audio.mp3';
    const objectKey = `${assetId}-${cleanName}`;
    const expiresAtDate = new Date(Date.now() + 1800 * 1000);

    await this.audioAssetModel.create({
      _id: assetObjectId,
      objectKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: AudioAssetStatus.PENDING,
      storageDriver: this.getGridFsBucket('audio_files')
        ? AudioStorageDriver.GRIDFS
        : AudioStorageDriver.DISK,
      expiresAt: expiresAtDate,
      uploadedBy: actor._id,
    });

    return {
      assetId,
      objectKey,
      uploadUrl: this.buildApiMediaUrl('audio', `/upload/${encodeURIComponent(objectKey)}`, requestOrigin),
      expiresAt: expiresAtDate.toISOString(),
    };
  }

  async handleBinaryUpload(key: string, req: any, requestOrigin?: string) {
    const cleanKey = decodeURIComponent(key).replace(/[^a-zA-Z0-9._-]/g, '_');
    const asset = await this.audioAssetModel
      .findOne(
        Types.ObjectId.isValid(cleanKey)
          ? { _id: new Types.ObjectId(cleanKey) }
          : { objectKey: cleanKey },
      )
      .exec();

    if (!asset) {
      throw new NotFoundException('Audio upload intent not found or invalid key');
    }

    if (
      asset.status === AudioAssetStatus.PENDING &&
      asset.expiresAt &&
      asset.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Upload URL has expired. Please start a new upload.');
    }

    const stored = await this.streamRequestToStorage({
      req,
      bucketName: 'audio_files',
      diskSubdir: 'audio',
      objectKey: asset.objectKey,
      maxBytes: MAX_AUDIO_BYTES,
      existingGridFsId: asset.gridFsFileId,
      metadata: {
        assetId: asset._id.toHexString(),
        originalFilename: asset.filename,
        mimeType: asset.mimeType,
        uploadedBy: String(asset.uploadedBy),
      },
    });

    asset.status = AudioAssetStatus.READY;
    asset.actualSize = stored.receivedBytes;
    asset.storageDriver = stored.useGridFs ? AudioStorageDriver.GRIDFS : AudioStorageDriver.DISK;
    if (stored.gridFsFileId) asset.gridFsFileId = stored.gridFsFileId;
    if (stored.localFilename) asset.localFilename = stored.localFilename;
    await asset.save();

    return {
      ok: true,
      assetId: asset._id.toHexString(),
      objectKey: asset.objectKey,
      sizeBytes: stored.receivedBytes,
      streamUrl: this.buildApiMediaUrl('audio', `/stream/${encodeURIComponent(asset.objectKey)}`, requestOrigin),
    };
  }

  async completeUpload(dto: AudioUploadCompleteDto, _actor: UserDocument) {
    if (!Types.ObjectId.isValid(dto.assetId)) {
      return { ok: true };
    }

    const asset = await this.audioAssetModel.findById(dto.assetId).exec();
    if (!asset) {
      throw new NotFoundException('Audio asset not found');
    }

    if (dto.durationSeconds !== undefined) {
      asset.durationSeconds = dto.durationSeconds;
      await asset.save();
    }

    return {
      ok: asset.status === AudioAssetStatus.READY,
      assetId: asset._id.toHexString(),
      status: asset.status,
    };
  }

  async streamAudio(filenameOrKey: string, req: any, res: any) {
    const cleanKey = decodeURIComponent(filenameOrKey).replace(/[^a-zA-Z0-9._-]/g, '_');
    const asset = await this.audioAssetModel
      .findOne(
        Types.ObjectId.isValid(cleanKey)
          ? { _id: new Types.ObjectId(cleanKey) }
          : { objectKey: cleanKey },
      )
      .exec();

    const bucket = this.getGridFsBucket('audio_files');

    if (asset?.gridFsFileId && bucket) {
      const fileDoc = await bucket.find({ _id: asset.gridFsFileId }).next();
      if (fileDoc) {
        const total = fileDoc.length;
        const contentType = asset.mimeType || getMimeFromFilename(asset.filename);
        const range = req.headers?.range;

        if (range) {
          const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
          if (!match) {
            res.status(416).set({ 'Content-Range': `bytes */${total}` }).end();
            return;
          }
          const start = match[1]
            ? parseInt(match[1], 10)
            : Math.max(0, total - parseInt(match[2], 10));
          const end =
            match[2] && match[1]
              ? Math.min(total - 1, parseInt(match[2], 10))
              : total - 1;

          if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= total || start > end) {
            res.status(416).set({ 'Content-Range': `bytes */${total}` }).end();
            return;
          }

          const chunkSize = end - start + 1;
          res.status(206).set({
            'Content-Range': `bytes ${start}-${end}/${total}`,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(chunkSize),
            'Content-Type': contentType,
            'Cross-Origin-Resource-Policy': 'cross-origin',
            'Cache-Control': 'private, max-age=3600',
          });

          const downloadStream = bucket.openDownloadStream(asset.gridFsFileId, {
            start,
            end: end + 1,
          });
          downloadStream.on('error', (err) => {
            this.logger.warn(`GridFS range stream interrupted: ${err.message}`);
            if (!res.headersSent) res.status(500).end();
            else res.end();
          });
          downloadStream.pipe(res);
          return;
        }

        res.status(200).set({
          'Accept-Ranges': 'bytes',
          'Content-Length': String(total),
          'Content-Type': contentType,
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'private, max-age=3600',
        });

        const downloadStream = bucket.openDownloadStream(asset.gridFsFileId);
        downloadStream.on('error', (err) => {
          this.logger.warn(`GridFS stream interrupted: ${err.message}`);
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        downloadStream.pipe(res);
        return;
      }
    }

    const uploadsDir = this.getUploadDir('audio');
    const targetName = asset?.localFilename || asset?.objectKey || cleanKey;
    let filePath = path.join(uploadsDir, targetName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(process.cwd(), 'frontend', 'public', 'audio', cleanKey);
    }
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Audio file not found');
    }

    const stat = fs.statSync(filePath);
    const total = stat.size;
    const contentType = asset?.mimeType || getMimeFromFilename(targetName);
    const range = req.headers?.range;

    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
      if (!match) {
        res.status(416).set({ 'Content-Range': `bytes */${total}` }).end();
        return;
      }
      const start = match[1]
        ? parseInt(match[1], 10)
        : Math.max(0, total - parseInt(match[2], 10));
      const end =
        match[2] && match[1]
          ? Math.min(total - 1, parseInt(match[2], 10))
          : total - 1;

      if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= total || start > end) {
        res.status(416).set({ 'Content-Range': `bytes */${total}` }).end();
        return;
      }

      const chunkSize = end - start + 1;
      res.status(206).set({
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': String(chunkSize),
        'Content-Type': contentType,
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Cache-Control': 'private, max-age=3600',
      });
      fs.createReadStream(filePath, { start, end }).pipe(res);
      return;
    }

    res.status(200).set({
      'Accept-Ranges': 'bytes',
      'Content-Length': String(total),
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'private, max-age=3600',
    });
    fs.createReadStream(filePath).pipe(res);
  }

  // ─── Image Upload & Streaming (for IELTS Diagrams, Maps, Charts) ──────────

  async createImageUploadIntent(
    dto: ImageUploadIntentDto,
    actor: UserDocument,
    requestOrigin?: string,
  ) {
    if (!this.imageAssetModel) {
      throw new BadRequestException('Image asset storage is not configured');
    }
    if (dto.fileSize > MAX_IMAGE_BYTES) {
      throw new BadRequestException('Image file exceeds the maximum size limit of 10MB');
    }

    const assetObjectId = new Types.ObjectId();
    const assetId = assetObjectId.toHexString();
    const cleanName = dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_') || 'image.png';
    const objectKey = `${assetId}-${cleanName}`;
    const expiresAtDate = new Date(Date.now() + 1800 * 1000);

    await this.imageAssetModel.create({
      _id: assetObjectId,
      objectKey,
      filename: dto.filename,
      mimeType: dto.mimeType,
      fileSize: dto.fileSize,
      status: ImageAssetStatus.PENDING,
      storageDriver: this.getGridFsBucket('image_files')
        ? ImageStorageDriver.GRIDFS
        : ImageStorageDriver.DISK,
      expiresAt: expiresAtDate,
      uploadedBy: actor._id,
    });

    const streamUrl = this.buildApiMediaUrl(
      'images',
      `/stream/${encodeURIComponent(objectKey)}`,
      requestOrigin,
    );

    return {
      assetId,
      objectKey,
      uploadUrl: this.buildApiMediaUrl('images', `/upload/${encodeURIComponent(objectKey)}`, requestOrigin),
      streamUrl,
      expiresAt: expiresAtDate.toISOString(),
    };
  }

  async handleImageBinaryUpload(key: string, req: any, requestOrigin?: string) {
    if (!this.imageAssetModel) {
      throw new BadRequestException('Image asset storage is not configured');
    }

    const cleanKey = decodeURIComponent(key).replace(/[^a-zA-Z0-9._-]/g, '_');
    const asset = await this.imageAssetModel
      .findOne(
        Types.ObjectId.isValid(cleanKey)
          ? { _id: new Types.ObjectId(cleanKey) }
          : { objectKey: cleanKey },
      )
      .exec();

    if (!asset) {
      throw new NotFoundException('Image upload intent not found or invalid key');
    }

    if (
      asset.status === ImageAssetStatus.PENDING &&
      asset.expiresAt &&
      asset.expiresAt.getTime() < Date.now()
    ) {
      throw new BadRequestException('Image upload URL has expired. Please try again.');
    }

    const stored = await this.streamRequestToStorage({
      req,
      bucketName: 'image_files',
      diskSubdir: 'images',
      objectKey: asset.objectKey,
      maxBytes: MAX_IMAGE_BYTES,
      existingGridFsId: asset.gridFsFileId,
      metadata: {
        assetId: asset._id.toHexString(),
        originalFilename: asset.filename,
        mimeType: asset.mimeType,
        uploadedBy: String(asset.uploadedBy),
      },
    });

    asset.status = ImageAssetStatus.READY;
    asset.actualSize = stored.receivedBytes;
    asset.storageDriver = stored.useGridFs ? ImageStorageDriver.GRIDFS : ImageStorageDriver.DISK;
    if (stored.gridFsFileId) asset.gridFsFileId = stored.gridFsFileId;
    if (stored.localFilename) asset.localFilename = stored.localFilename;
    await asset.save();

    const streamUrl = this.buildApiMediaUrl(
      'images',
      `/stream/${encodeURIComponent(asset.objectKey)}`,
      requestOrigin,
    );

    return {
      ok: true,
      assetId: asset._id.toHexString(),
      objectKey: asset.objectKey,
      sizeBytes: stored.receivedBytes,
      url: streamUrl,
      streamUrl,
    };
  }

  async streamImage(filenameOrKey: string, res: any) {
    const cleanKey = decodeURIComponent(filenameOrKey).replace(/[^a-zA-Z0-9._-]/g, '_');
    const asset = this.imageAssetModel
      ? await this.imageAssetModel
          .findOne(
            Types.ObjectId.isValid(cleanKey)
              ? { _id: new Types.ObjectId(cleanKey) }
              : { objectKey: cleanKey },
          )
          .exec()
      : null;

    const bucket = this.getGridFsBucket('image_files');
    if (asset?.gridFsFileId && bucket) {
      const fileDoc = await bucket.find({ _id: asset.gridFsFileId }).next();
      if (fileDoc) {
        const contentType = asset.mimeType || getMimeFromFilename(asset.filename);
        res.status(200).set({
          'Content-Length': String(fileDoc.length),
          'Content-Type': contentType,
          'Cross-Origin-Resource-Policy': 'cross-origin',
          'Cache-Control': 'public, max-age=31536000, immutable',
        });
        const downloadStream = bucket.openDownloadStream(asset.gridFsFileId);
        downloadStream.on('error', (err) => {
          this.logger.warn(`GridFS image stream interrupted: ${err.message}`);
          if (!res.headersSent) res.status(500).end();
          else res.end();
        });
        downloadStream.pipe(res);
        return;
      }
    }

    const uploadsDir = this.getUploadDir('images');
    const targetName = asset?.localFilename || asset?.objectKey || cleanKey;
    const filePath = path.join(uploadsDir, targetName);
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Image file not found');
    }

    const stat = fs.statSync(filePath);
    const contentType = asset?.mimeType || getMimeFromFilename(targetName);
    res.status(200).set({
      'Content-Length': String(stat.size),
      'Content-Type': contentType,
      'Cross-Origin-Resource-Policy': 'cross-origin',
      'Cache-Control': 'public, max-age=31536000, immutable',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
