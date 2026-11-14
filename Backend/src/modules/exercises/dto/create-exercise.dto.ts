import {
  IsString,
  IsEnum,
  IsOptional,
  IsArray,
  ValidateNested,
  IsNumber,
  Min,
  Max,
  MinLength,
  MaxLength,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExerciseType, ExerciseStatus } from 'src/database/schemas/enums';
import { QuestionDto } from './question.dto';

export class AudioAssetDto {
  @ApiProperty({ example: 'audio/listening-test-1-part-1.mp3' })
  @IsString()
  objectKey: string;

  @ApiPropertyOptional({ example: 'https://cdn.example.com/audio/listening-test-1-part-1.mp3' })
  @IsOptional()
  @IsString()
  url?: string;

  @ApiPropertyOptional({ example: 360 })
  @IsOptional()
  @IsNumber()
  durationSeconds?: number;
}

export class CreateExerciseDto {
  @ApiProperty({ example: 'Academic Reading — The History of Glass' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional({ example: 'Practice test for Band 6.5+ students' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiProperty({ enum: ExerciseType })
  @IsEnum(ExerciseType)
  type: ExerciseType;

  @ApiPropertyOptional({ description: 'Reading passage text or formatted blocks' })
  @IsOptional()
  @IsString()
  passage?: string;

  @ApiPropertyOptional({ type: [AudioAssetDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AudioAssetDto)
  audioAssets?: AudioAssetDto[];

  @ApiProperty({ type: [QuestionDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => QuestionDto)
  questions: QuestionDto[];

  @ApiPropertyOptional({ default: 70, minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  passScore?: number = 70;

  @ApiPropertyOptional({ enum: ExerciseStatus, default: ExerciseStatus.DRAFT })
  @IsOptional()
  @IsEnum(ExerciseStatus)
  status?: ExerciseStatus;
}
