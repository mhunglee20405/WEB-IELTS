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
import { ApiPropertyOptional } from '@nestjs/swagger';
import { CourseStatus, CourseType } from 'src/database/schemas/enums';
import { IsIeltsBand } from 'src/common/validators/ielts-band.validator';

export class UpdateCourseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(3)
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsIeltsBand()
  startBand?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: 9 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9)
  @IsIeltsBand()
  targetBand?: number;

  @ApiPropertyOptional({ enum: CourseType })
  @IsOptional()
  type?: CourseType;

  @ApiPropertyOptional({ example: 'group' })
  @IsOptional()
  @IsString()
  courseType?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsMongoId()
  teacherId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endDate?: string;

  @ApiPropertyOptional({ example: 'Asia/Ho_Chi_Minh' })
  @IsOptional()
  @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: CourseStatus })
  @IsOptional()
  @IsEnum(CourseStatus)
  status?: CourseStatus;
}

