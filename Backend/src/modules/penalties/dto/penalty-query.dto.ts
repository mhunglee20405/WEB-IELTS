import { IsOptional, IsInt, Min, Max, IsMongoId, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PenaltyQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by Student User ObjectId' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;

  @ApiPropertyOptional({ description: 'Filter by Course ObjectId' })
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filter by status: all, active, reversed' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'Search term by student name or reason' })
  @IsOptional()
  @IsString()
  search?: string;
}

