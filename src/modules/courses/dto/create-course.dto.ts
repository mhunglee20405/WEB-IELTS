import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  Max,
  IsDateString,
  IsMongoId,
  MinLength,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CourseType } from 'src/database/schemas/enums';
import { IsIeltsBand } from 'src/common/validators/ielts-band.validator';

export class CreateCourseDto {
  @ApiProperty({ example: 'IELTS-B1-2026-01' })
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'IELTS Foundation — Band 5→6' })
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 5, description: 'Starting IELTS band (0–9, 0.5 step)' })
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsIeltsBand()
  startBand: number;

  @ApiProperty({ example: 6.5, description: 'Target IELTS band (0–9, 0.5 step)' })
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsIeltsBand()
  targetBand: number;

  @ApiProperty({ enum: CourseType })
  @IsEnum(CourseType)
  type: CourseType;

  @ApiProperty({ description: 'Teacher user ID (ObjectId)' })
  @IsMongoId()
  teacherId: string;

  @ApiPropertyOptional({ example: '2026-01-15T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional({ example: '2026-06-30T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  endAt?: string;
}

