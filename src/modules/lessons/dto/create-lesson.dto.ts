import {
  IsString,
  IsOptional,
  IsDateString,
  IsUrl,
  IsEnum,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { LessonStatus } from 'src/database/schemas/enums';

export class CreateLessonDto {
  @ApiProperty({ example: 'Reading Passage 1 — Skimming & Scanning' })
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title: string;

  @ApiProperty({ example: '2026-11-15T12:00:00.000Z', description: 'UTC ISO timestamp' })
  @IsDateString()
  startAt: string;

  @ApiProperty({ example: '2026-11-15T13:30:00.000Z', description: 'UTC ISO timestamp' })
  @IsDateString()
  endAt: string;

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

  @ApiPropertyOptional({ enum: LessonStatus, default: LessonStatus.SCHEDULED })
  @IsOptional()
  @IsEnum(LessonStatus)
  status?: LessonStatus;
}

