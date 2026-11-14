import {
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { AudioUploadIntentDto } from './dto/media.dto';
import { UserDocument } from 'src/database/schemas/user.schema';

@Injectable()
export class MediaService {
  async getPlaybackUrl(assetId: string, actor: UserDocument) {
    if (!assetId) {
      throw new BadRequestException('Asset ID is required');
    }

    // Generate signed/authorized playback stream URL
    const expiresAt = new Date(Date.now() + 3600 * 1000).toISOString();
    return {
      assetId,
      streamUrl: `https://storage.ielts-lms.local/audio/${assetId}?token=mock-playback-token&expires=${encodeURIComponent(expiresAt)}`,
      mimeType: 'audio/mpeg',
      durationSeconds: 1800,
      expiresAt,
    };
  }

  async createUploadIntent(dto: AudioUploadIntentDto, actor: UserDocument) {
    // 50 MB limit
    const MAX_FILE_SIZE = 50 * 1024 * 1024;
    if (dto.fileSize > MAX_FILE_SIZE) {
      throw new BadRequestException('Audio file exceeds the maximum size limit of 50MB');
    }

    const assetId = new Types.ObjectId().toHexString();
    const objectKey = `audio/${actor._id}/${assetId}-${dto.filename.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const expiresAt = new Date(Date.now() + 1800 * 1000).toISOString();

    return {
      assetId,
      objectKey,
      uploadUrl: `https://storage.ielts-lms.local/upload/${objectKey}?uploadToken=mock-upload-token`,
      expiresAt,
    };
  }
}

