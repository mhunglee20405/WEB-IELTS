import {
  IsMongoId,
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsNumber,
  Min,
  Max,
  IsEnum,
  IsArray,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from 'src/database/schemas/enums';
import { CreateQuestionGroupDto } from 'src/modules/exam-tests/dto/exam-test.dto';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Target Course ObjectId' })
  @IsMongoId()
  courseId: string;

  @ApiProperty({ description: 'Published Exercise or ExamTest ObjectId' })
  @IsMongoId()
  exerciseId: string;

  @ApiPropertyOptional({ example: 'Reading Day 1: Glass History' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: '2026-11-20',
    description: 'Target VN date (YYYY-MM-DD). If provided, openAt=06:00:00 and deadlineAt=06:00:00 following day in local VN time',
  })
  @IsOptional()
  @IsString()
  targetDate?: string;

  @ApiPropertyOptional({
    example: '2026-11-20',
    description: 'Assigned local VN date (YYYY-MM-DD). Computes availableAt 06:00 to dueAt 06:00 following day',
  })
  @IsOptional()
  @IsString()
  assignedDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20T06:00:00.000Z', description: 'Explicit UTC open timestamp' })
  @IsOptional()
  @IsDateString()
  openAt?: string;

  @ApiPropertyOptional({ example: '2026-11-21T06:00:00.000Z', description: 'Explicit UTC deadline timestamp' })
  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @ApiPropertyOptional({ default: false, description: 'Allow retaking exercise' })
  @IsOptional()
  @IsBoolean()
  allowRetake?: boolean;

  @ApiPropertyOptional({ example: 3, minimum: 1, description: 'Maximum allowed attempts if allowRetake is true' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional({ enum: AssignmentStatus, default: AssignmentStatus.PUBLISHED })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @ApiPropertyOptional({ enum: ['draft', 'schedule', 'publish'], description: 'Teacher action intent' })
  @IsOptional()
  @IsString()
  action?: 'draft' | 'schedule' | 'publish';

  @ApiPropertyOptional({ enum: ['PART', 'FULL'], default: 'FULL' })
  @IsOptional()
  @IsEnum(['PART', 'FULL'])
  requiredScope?: string;

  @ApiPropertyOptional({ description: 'ExamPart ObjectId if assigning a specific PART' })
  @IsOptional()
  @IsString()
  requiredPartId?: string;

  @ApiPropertyOptional({ example: ['PART', 'FULL'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  allowedModes?: string[];

  @ApiPropertyOptional({ example: 1200, description: 'Duration in seconds override' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSecondsOverride?: number;

  @ApiPropertyOptional({ description: 'Optional list of specific QuestionGroup IDs to include' })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedQuestionGroupIds?: string[];

  @ApiPropertyOptional({ example: 70, minimum: 0, maximum: 100, description: 'Teacher-configured target score percent for assignment' })
  @IsOptional()
  @IsNumber()
  targetScorePercent?: number;

  @ApiPropertyOptional({ description: 'Optional custom IELTS question groups authored directly for this assignment', type: [CreateQuestionGroupDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateQuestionGroupDto)
  customQuestionGroups?: CreateQuestionGroupDto[];

  @ApiPropertyOptional({ description: 'Client idempotency key for preventing duplicate assignment creation' })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

