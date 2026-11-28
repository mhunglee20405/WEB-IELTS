import {
  IsString,
  IsOptional,
  IsDateString,
  IsUrl,
  IsEnum,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonStatus, LessonType } from 'src/database/schemas/enums';

export class CreateLessonDto {
  @ApiPropertyOptional({ description: 'Course ObjectId (required when using POST /lessons directly)' })
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @ApiProperty({ example: 'Reading Passage 1 — Skimming & Scanning' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: '2026-11-15T12:00:00.000Z', description: 'UTC ISO timestamp (canonical)' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-11-15T12:00:00.000Z', description: 'UTC ISO timestamp (frontend alias)' })
  @IsOptional()
  @IsDateString()
  startTime?: string;

  @ApiPropertyOptional({ example: '2026-11-15T13:30:00.000Z', description: 'UTC ISO timestamp (canonical)' })
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional({ example: '2026-11-15T13:30:00.000Z', description: 'UTC ISO timestamp (frontend alias)' })
  @IsOptional()
  @IsDateString()
  endTime?: string;

  @ApiPropertyOptional({
    example: 'https://meet.google.com/abc-defg-hij',
    description: 'Google Meet or HTTPS video meeting URL',
  })
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  meetUrl?: string;

  @ApiPropertyOptional({ example: 'Bring Cambridge IELTS 18 Reading Test 1.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  content?: string;

  @ApiPropertyOptional({ example: 'Bring Cambridge IELTS 18 Reading Test 1.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @ApiPropertyOptional({ enum: LessonStatus, default: LessonStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;

  @ApiPropertyOptional({ enum: LessonType, example: LessonType.LIVE_MEET })
  @IsOptional()
  @IsEnum(LessonType)
  type?: LessonType;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

