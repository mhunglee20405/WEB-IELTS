import {
  IsMongoId,
  IsString,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsNumber,
  Min,
  IsEnum,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AssignmentStatus } from 'src/database/schemas/enums';

export class CreateAssignmentDto {
  @ApiProperty({ description: 'Target Course ObjectId' })
  @IsMongoId()
  courseId: string;

  @ApiProperty({ description: 'Published Exercise ObjectId' })
  @IsMongoId()
  exerciseId: string;

  @ApiPropertyOptional({ example: 'Reading Day 1: Glass History' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  title?: string;

  @ApiPropertyOptional({
    example: '2026-11-20',
    description: 'Target VN date (YYYY-MM-DD). If provided, openAt=00:00:00 and deadlineAt=23:59:59.999 local VN time',
  })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'targetDate must be in YYYY-MM-DD format' })
  targetDate?: string;

  @ApiPropertyOptional({ example: '2026-11-20T00:00:00.000Z', description: 'Explicit UTC open timestamp' })
  @IsOptional()
  @IsDateString()
  openAt?: string;

  @ApiPropertyOptional({ example: '2026-11-20T23:59:59.999Z', description: 'Explicit UTC deadline timestamp' })
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
}

