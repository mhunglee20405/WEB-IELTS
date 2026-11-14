import {
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
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from 'src/database/schemas/enums';

export class UpdateAssignmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({ example: '2026-11-20' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'assignedDate must be in YYYY-MM-DD format' })
  assignedDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20T06:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  openAt?: string;

  @ApiPropertyOptional({ example: '2026-11-21T06:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  allowRetake?: boolean;

  @ApiPropertyOptional({ minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  maxAttempts?: number;

  @ApiPropertyOptional({ enum: AssignmentStatus })
  @IsOptional()
  @IsEnum(AssignmentStatus)
  status?: AssignmentStatus;

  @ApiPropertyOptional({ enum: ['draft', 'schedule', 'publish'] })
  @IsOptional()
  @IsString()
  action?: 'draft' | 'schedule' | 'publish';

  @ApiPropertyOptional({ enum: ['PART', 'FULL'] })
  @IsOptional()
  @IsEnum(['PART', 'FULL'])
  requiredScope?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  requiredPartId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  durationSecondsOverride?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  selectedQuestionGroupIds?: string[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  targetScorePercent?: number;
}

