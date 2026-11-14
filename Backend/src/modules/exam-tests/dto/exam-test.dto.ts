import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsBoolean,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ExamSkill,
  ExamMode,
  ExamPreset,
  ExamTestStatus,
  PartType,
  ExamQuestionType,
} from 'src/database/schemas/enums';

export class ExamOptionDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  key: string;

  @ApiProperty({ example: 'Option A description' })
  @IsString()
  text: string;
}

export class ExamGradingDto {
  @ApiProperty({ example: ['A', 'TRUE'] })
  @IsArray()
  @IsString({ each: true })
  acceptedKeys: string[];

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  caseSensitive?: boolean;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxWords?: number;
}

export class ExamQuestionDto {
  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  number: number;

  @ApiProperty({ example: 'The study concluded that...' })
  @IsString()
  prompt: string;

  @ApiProperty({ enum: ExamQuestionType, example: ExamQuestionType.MULTIPLE_CHOICE_SINGLE })
  @IsEnum(ExamQuestionType)
  type: ExamQuestionType;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(0)
  points: number;

  @ApiPropertyOptional({ type: [ExamOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamOptionDto)
  options?: ExamOptionDto[];

  @ApiPropertyOptional({ type: ExamGradingDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ExamGradingDto)
  grading?: ExamGradingDto;
}

export class CreateExamTestDto {
  @ApiProperty({ example: 'IELTS Reading Practice Test 01' })
  @IsString()
  title: string;

  @ApiProperty({ enum: ExamSkill, example: ExamSkill.READING })
  @IsEnum(ExamSkill)
  skill: ExamSkill;

  @ApiPropertyOptional({ example: 'Luyện tập Reading 3 passages' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ExamPreset, default: ExamPreset.IELTS_ACADEMIC })
  @IsOptional()
  @IsEnum(ExamPreset)
  examPreset?: ExamPreset;

  @ApiPropertyOptional({ enum: ExamMode, isArray: true, default: [ExamMode.PART, ExamMode.FULL] })
  @IsOptional()
  @IsArray()
  @IsEnum(ExamMode, { each: true })
  allowedModes?: ExamMode[];

  @ApiPropertyOptional({ default: 70, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passScore?: number;

  @ApiPropertyOptional({ example: 3600, description: 'Duration in seconds for full test' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fullDurationSeconds?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  translationEnabled?: boolean;
}

export class UpdateExamTestDto {
  @ApiPropertyOptional({ example: 'Updated title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ enum: ExamPreset })
  @IsOptional()
  @IsEnum(ExamPreset)
  examPreset?: ExamPreset;

  @ApiPropertyOptional({ enum: ExamMode, isArray: true })
  @IsOptional()
  @IsArray()
  @IsEnum(ExamMode, { each: true })
  allowedModes?: ExamMode[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passScore?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  fullDurationSeconds?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  translationEnabled?: boolean;
}

export class CreateExamPartDto {
  @ApiProperty({ enum: PartType, example: PartType.PASSAGE })
  @IsEnum(PartType)
  type: PartType;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  ordinal: number;

  @ApiProperty({ example: 'Passage 1 — The History of Glass' })
  @IsString()
  title: string;

  @ApiPropertyOptional({ example: '<p>Glass was first produced in...</p>' })
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @ApiPropertyOptional({ description: 'Asset ObjectId for audio' })
  @IsOptional()
  @IsString()
  audioAssetId?: string;

  @ApiPropertyOptional({ example: 1200 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;
}

export class UpdateExamPartDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  ordinal?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  contentHtml?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  audioAssetId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSeconds?: number;
}

export class CreateQuestionGroupDto {
  @ApiPropertyOptional({ example: 'Questions 1–5' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'Choose TRUE, FALSE or NOT GIVEN' })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiProperty({ enum: ExamQuestionType, example: ExamQuestionType.TRUE_FALSE_NOT_GIVEN })
  @IsEnum(ExamQuestionType)
  type: ExamQuestionType;

  @ApiProperty({ example: 1 })
  @IsNumber()
  @Min(1)
  order: number;

  @ApiPropertyOptional({ type: [ExamOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamOptionDto)
  sharedOptions?: ExamOptionDto[];

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxWords?: number;

  @ApiProperty({ type: [ExamQuestionDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionDto)
  questions: ExamQuestionDto[];
}

export class UpdateQuestionGroupDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({ enum: ExamQuestionType })
  @IsOptional()
  @IsEnum(ExamQuestionType)
  type?: ExamQuestionType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  order?: number;

  @ApiPropertyOptional({ type: [ExamOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamOptionDto)
  sharedOptions?: ExamOptionDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxWords?: number;

  @ApiPropertyOptional({ type: [ExamQuestionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExamQuestionDto)
  questions?: ExamQuestionDto[];
}

export class ExamTestQueryDto {
  @ApiPropertyOptional({ enum: ExamSkill })
  @IsOptional()
  @IsEnum(ExamSkill)
  skill?: ExamSkill;

  @ApiPropertyOptional({ enum: ExamTestStatus })
  @IsOptional()
  @IsEnum(ExamTestStatus)
  status?: ExamTestStatus;

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

