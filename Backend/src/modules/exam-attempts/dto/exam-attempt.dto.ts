import {
  IsString,
  IsEnum,
  IsOptional,
  IsMongoId,
  IsArray,
  IsNumber,
  Min,
  ValidateNested,
  IsDefined,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExamMode } from 'src/database/schemas/enums';

export class CreateExamAttemptDto {
  @ApiPropertyOptional({ description: 'ExamTest ObjectId' })
  @IsOptional()
  @IsMongoId()
  testId?: string;

  @ApiPropertyOptional({ description: 'Assignment ObjectId if attempt is linked to homework' })
  @IsOptional()
  @IsMongoId()
  assignmentId?: string;

  @ApiProperty({ enum: ExamMode, example: ExamMode.PART })
  @IsEnum(ExamMode)
  mode: ExamMode;

  @ApiPropertyOptional({
    description: 'ExamPart ObjectId (required when mode is PART, must be omitted or null when FULL)',
    example: '65f01234567890abcdef1234',
  })
  @IsOptional()
  partId?: string | null;

  @ApiPropertyOptional({
    description: 'Optional StudentAssignment ObjectId if attempt is linked to homework',
  })
  @IsOptional()
  @IsMongoId()
  studentAssignmentId?: string | null;

  @ApiPropertyOptional({
    description: 'Client idempotency UUID to prevent duplicate attempt creation',
    example: 'start-unique-client-uuid-1234',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class AnswerItemDto {
  @ApiProperty({ example: '1' })
  @IsString()
  questionId: string;

  @ApiProperty({
    example: 'TRUE',
    description: 'Answer value: string for single/TFNG/completion, or array of strings for multiple choice',
  })
  @IsDefined()
  value: any;
}

export class SaveAnswersDto {
  @ApiProperty({
    example: 0,
    description: 'Current revision known by client (for optimistic concurrency check)',
  })
  @IsNumber()
  @Min(0)
  baseRevision: number;

  @ApiProperty({
    description: 'Array of { questionId, value } or Record of { [questionId]: value }',
  })
  @IsDefined()
  answers: AnswerItemDto[] | Record<string, any>;

  @ApiPropertyOptional({
    description: 'Optional list of flagged question IDs',
    example: ['1', '5'],
  })
  @IsOptional()
  @IsArray()
  flaggedQuestionIds?: string[];
}

export class SubmitAttemptDto {
  @ApiPropertyOptional({
    example: 'submit-unique-client-uuid-1234',
    description: 'Client idempotency UUID for submit call',
  })
  @IsOptional()
  @IsString()
  idempotencyKey?: string;

  @ApiPropertyOptional({ example: 4 })
  @IsOptional()
  @IsNumber()
  expectedRevision?: number;
}

