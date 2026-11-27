import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { FeedbackCategory, FeedbackStatus } from 'src/database/schemas/enums';

export class CreateFeedbackDto {
  @ApiProperty({ enum: FeedbackCategory, description: 'Feedback category' })
  @IsEnum(FeedbackCategory)
  category: FeedbackCategory;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Optional rating from 1 to 5' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  rating?: number;

  @ApiProperty({ minLength: 10, maxLength: 2000, description: 'Feedback content' })
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(10)
  @MaxLength(2000)
  content: string;
}

export class FeedbackQueryDto {
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

  @ApiPropertyOptional({ enum: FeedbackStatus, description: 'Filter by feedback status' })
  @IsOptional()
  @IsEnum(FeedbackStatus)
  status?: FeedbackStatus;

  @ApiPropertyOptional({ enum: FeedbackCategory, description: 'Filter by feedback category' })
  @IsOptional()
  @IsEnum(FeedbackCategory)
  category?: FeedbackCategory;

  @ApiPropertyOptional({ maxLength: 200, description: 'Case-insensitive search in content' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  search?: string;
}

export class UpdateFeedbackStatusDto {
  @ApiProperty({ enum: FeedbackStatus, description: 'New feedback triage status' })
  @IsEnum(FeedbackStatus)
  status: FeedbackStatus;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Optional internal admin note' })
  @IsOptional()
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MaxLength(1000)
  adminNote?: string;
}
