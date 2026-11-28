import { Test, TestingModule } from '@nestjs/testing';
import { getConnectionToken, getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { PassThrough } from 'stream';
import { MediaService } from './media.service';
import {
  AudioAsset,
  AudioAssetStatus,
  AudioStorageDriver,
} from 'src/database/schemas/audio-asset.schema';
import {
  ImageAsset,
  ImageAssetStatus,
  ImageStorageDriver,
} from 'src/database/schemas/image-asset.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import * as fs from 'fs';

describe('MediaService', () => {
  let service: MediaService;
  let audioAssetModel: any;
  let imageAssetModel: any;

  const teacher = {
    _id: new Types.ObjectId(),
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  beforeEach(async () => {
    audioAssetModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };
    imageAssetModel = {
      create: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        {
          provide: getModelToken(AudioAsset.name),
          useValue: audioAssetModel,
        },
        {
          provide: getModelToken(ImageAsset.name),
          useValue: imageAssetModel,
        },
        {
          provide: getConnectionToken(),
          useValue: { db: null },
        },
      ],
    }).compile();

    service = module.get<MediaService>(MediaService);
  });

  describe('createUploadIntent', () => {
    it('persists a PENDING AudioAsset record and returns absolute uploadUrl', async () => {
      audioAssetModel.create.mockImplementation(async (doc: any) => doc);

      const res = await service.createUploadIntent(
        {
          filename: 'section 1.mp3',
          mimeType: 'audio/mpeg',
          fileSize: 2048,
        },
        teacher,
        'http://localhost:3001',
      );

      expect(Types.ObjectId.isValid(res.assetId)).toBe(true);
      expect(res.objectKey).toBe(`${res.assetId}-section_1.mp3`);
      expect(res.uploadUrl).toBe(
        `http://localhost:3001/api/v1/media/audio/upload/${encodeURIComponent(res.objectKey)}`,
      );
      expect(audioAssetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          objectKey: res.objectKey,
          filename: 'section 1.mp3',
          mimeType: 'audio/mpeg',
          fileSize: 2048,
          status: AudioAssetStatus.PENDING,
          uploadedBy: teacher._id,
        }),
      );
    });

    it('rejects files over 50MB', async () => {
      await expect(
        service.createUploadIntent(
          {
            filename: 'huge.wav',
            mimeType: 'audio/wav',
            fileSize: 51 * 1024 * 1024,
          },
          teacher,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('handleBinaryUpload (disk fallback)', () => {
    it('stores binary audio stream, marks AudioAsset READY, and records actualSize', async () => {
      const assetId = new Types.ObjectId();
      const objectKey = `${assetId.toHexString()}-test_audio.wav`;
      const assetDoc: any = {
        _id: assetId,
        objectKey,
        filename: 'test_audio.wav',
        mimeType: 'audio/wav',
        fileSize: 16,
        status: AudioAssetStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        uploadedBy: teacher._id,
        save: jest.fn().mockResolvedValue(undefined),
      };
      audioAssetModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(assetDoc),
      });

      const reqStream = new PassThrough();
      reqStream.end(Buffer.from('RIFF....WAVEfmt '));

      const result = await service.handleBinaryUpload(
        objectKey,
        reqStream,
        'http://localhost:3001',
      );

      expect(result.ok).toBe(true);
      expect(result.sizeBytes).toBe(16);
      expect(result.streamUrl).toBe(
        `http://localhost:3001/api/v1/media/audio/stream/${encodeURIComponent(objectKey)}`,
      );
      expect(assetDoc.status).toBe(AudioAssetStatus.READY);
      expect(assetDoc.storageDriver).toBe(AudioStorageDriver.DISK);
      expect(assetDoc.actualSize).toBe(16);
      expect(assetDoc.save).toHaveBeenCalled();

      // Cleanup temporary file created during test
      const createdFile = `${process.cwd()}/uploads/audio/${objectKey}`;
      if (fs.existsSync(createdFile)) {
        fs.unlinkSync(createdFile);
      }
    });
  });

  describe('getPlaybackUrl', () => {
    it('returns stored streamUrl for READY AudioAsset in database', async () => {
      const assetId = new Types.ObjectId();
      const objectKey = `${assetId.toHexString()}-listening.mp3`;
      audioAssetModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue({
          _id: assetId,
          objectKey,
          filename: 'listening.mp3',
          mimeType: 'audio/mpeg',
          durationSeconds: 245,
          status: AudioAssetStatus.READY,
        }),
      });

      const playback = await service.getPlaybackUrl(
        assetId.toHexString(),
        teacher,
        'http://localhost:3001',
      );

      expect(playback.assetId).toBe(assetId.toHexString());
      expect(playback.streamUrl).toBe(
        `http://localhost:3001/api/v1/media/audio/stream/${encodeURIComponent(objectKey)}`,
      );
      expect(playback.mimeType).toBe('audio/mpeg');
      expect(playback.durationSeconds).toBe(245);
    });

    it('throws NotFoundException for unknown asset ObjectId', async () => {
      audioAssetModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(null),
      });

      await expect(
        service.getPlaybackUrl(new Types.ObjectId().toHexString(), teacher),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('Image upload intent & binary storage', () => {
    it('creates PENDING ImageAsset and returns absolute uploadUrl and streamUrl', async () => {
      imageAssetModel.create.mockImplementation(async (doc: any) => doc);

      const res = await service.createImageUploadIntent(
        {
          filename: 'campus map.png',
          mimeType: 'image/png',
          fileSize: 4096,
        },
        teacher,
        'http://localhost:3001',
      );

      expect(Types.ObjectId.isValid(res.assetId)).toBe(true);
      expect(res.objectKey).toBe(`${res.assetId}-campus_map.png`);
      expect(res.uploadUrl).toBe(
        `http://localhost:3001/api/v1/media/images/upload/${encodeURIComponent(res.objectKey)}`,
      );
      expect(res.streamUrl).toBe(
        `http://localhost:3001/api/v1/media/images/stream/${encodeURIComponent(res.objectKey)}`,
      );
      expect(imageAssetModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          objectKey: res.objectKey,
          filename: 'campus map.png',
          mimeType: 'image/png',
          fileSize: 4096,
          status: ImageAssetStatus.PENDING,
          uploadedBy: teacher._id,
        }),
      );
    });

    it('rejects images larger than 10MB', async () => {
      await expect(
        service.createImageUploadIntent(
          {
            filename: 'oversize.jpg',
            mimeType: 'image/jpeg',
            fileSize: 11 * 1024 * 1024,
          },
          teacher,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('stores binary image stream on disk fallback, marks READY, and returns streamUrl', async () => {
      const assetId = new Types.ObjectId();
      const objectKey = `${assetId.toHexString()}-map.png`;
      const assetDoc: any = {
        _id: assetId,
        objectKey,
        filename: 'map.png',
        mimeType: 'image/png',
        fileSize: 12,
        status: ImageAssetStatus.PENDING,
        expiresAt: new Date(Date.now() + 60_000),
        uploadedBy: teacher._id,
        save: jest.fn().mockResolvedValue(undefined),
      };
      imageAssetModel.findOne.mockReturnValue({
        exec: jest.fn().mockResolvedValue(assetDoc),
      });

      const reqStream = new PassThrough();
      reqStream.end(Buffer.from('PNG_DATA_123'));

      const result = await service.handleImageBinaryUpload(
        objectKey,
        reqStream,
        'http://localhost:3001',
      );

      expect(result.ok).toBe(true);
      expect(result.sizeBytes).toBe(12);
      expect(result.streamUrl).toBe(
        `http://localhost:3001/api/v1/media/images/stream/${encodeURIComponent(objectKey)}`,
      );
      expect(assetDoc.status).toBe(ImageAssetStatus.READY);
      expect(assetDoc.storageDriver).toBe(ImageStorageDriver.DISK);
      expect(assetDoc.actualSize).toBe(12);
      expect(assetDoc.save).toHaveBeenCalled();

      const createdFile = `${process.cwd()}/uploads/images/${objectKey}`;
      if (fs.existsSync(createdFile)) {
        fs.unlinkSync(createdFile);
      }
    });
  });
});
