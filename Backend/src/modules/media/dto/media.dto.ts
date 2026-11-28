import { IsString, IsNumber, Min, Max, IsIn, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

function normalizeAudioMime(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const base = value.split(';')[0].trim().toLowerCase();
  if (base === 'audio/wave' || base === 'audio/vnd.wave') return 'audio/wav';
  return base;
}

function normalizeImageMime(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const base = value.split(';')[0].trim().toLowerCase();
  if (base === 'image/jpg') return 'image/jpeg';
  return base;
}

export class AudioUploadIntentDto {
  @ApiProperty({ example: 'section1_recording.mp3' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'audio/mpeg' })
  @Transform(({ value }) => normalizeAudioMime(value))
  @IsString()
  @IsIn([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/aac',
    'audio/ogg',
    'audio/webm',
    'audio/flac',
    'audio/x-flac',
    'audio/opus',
  ])
  mimeType: string;

  @ApiProperty({ example: 10485760, description: 'File size in bytes (max 50MB)' })
  @IsNumber()
  @Min(1)
  fileSize: number;
}

export class AudioUploadCompleteDto {
  @ApiProperty({ example: '6745abc123def45678901234' })
  @IsString()
  assetId: string;

  @ApiPropertyOptional({ example: 185 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;
}

export class ImageUploadIntentDto {
  @ApiProperty({ example: 'listening_map_floor1.png' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'image/png' })
  @Transform(({ value }) => normalizeImageMime(value))
  @IsString()
  @IsIn(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
  mimeType: string;

  @ApiProperty({ example: 524288, description: 'Image size in bytes (max 10MB)' })
  @IsNumber()
  @Min(1)
  @Max(10 * 1024 * 1024)
  fileSize: number;
}
