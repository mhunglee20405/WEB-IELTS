import {
  IsString,
  IsOptional,
  IsMongoId,
  IsNumber,
  Min,
  Max,
  IsEnum,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranslationSubmissionStatus } from 'src/database/schemas/enums';

export class TranslationEligibilityQueryDto {
  @ApiProperty({ description: 'ExamTest ObjectId' })
  @IsMongoId()
  testId: string;

  @ApiPropertyOptional({ description: 'Optional StudentAssignment ObjectId' })
  @IsOptional()
  @IsMongoId()
  studentAssignmentId?: string;
}

export class SaveTranslationDraftDto {
  @ApiPropertyOptional({ description: 'ExamTest ObjectId' })
  @IsOptional()
  @IsMongoId()
  testId?: string;

  @ApiPropertyOptional({ description: 'Optional StudentAssignment ObjectId' })
  @IsOptional()
  @IsMongoId()
  studentAssignmentId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  exerciseVersion?: number;

  @ApiProperty({ example: 'Bản dịch tiếng Việt của bài đọc...' })
  @IsString()
  textVi: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  revision?: number;
}

export class SubmitReadingTranslationDto {
  @ApiPropertyOptional({ description: 'ExamTest ObjectId' })
  @IsOptional()
  @IsMongoId()
  testId?: string;

  @ApiPropertyOptional({ description: 'Optional StudentAssignment ObjectId' })
  @IsOptional()
  @IsMongoId()
  studentAssignmentId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  exerciseVersion?: number;

  @ApiPropertyOptional({ example: 'Bản dịch tiếng Việt hoàn chỉnh...' })
  @IsOptional()
  @IsString()
  textVi?: string;
}

export class ReviewReadingTranslationDto {
  @ApiProperty({ example: 'Bản dịch rất tốt, văn phong tự nhiên và chính xác thuật ngữ.' })
  @IsString()
  teacherComment: string;
}

export class TeacherTranslationQueryDto {
  @ApiPropertyOptional({ description: 'Filter by Course ObjectId' })
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @ApiPropertyOptional({ enum: TranslationSubmissionStatus })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.toLowerCase() : value))
  @IsEnum(TranslationSubmissionStatus)
  status?: TranslationSubmissionStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}

