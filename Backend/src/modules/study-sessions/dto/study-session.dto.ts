import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class StudyHeartbeatDto {
  @ApiProperty({
    minimum: 1,
    maximum: 90,
    description: 'Active study seconds elapsed since previous heartbeat (1..90)',
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(90)
  deltaSeconds: number;

  @ApiPropertyOptional({
    maxLength: 200,
    description: 'Optional student portal route pathname',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  route?: string;
}

export class TeacherStudySummaryQueryDto {
  @ApiPropertyOptional({
    description: 'Optional course ObjectId to scope enrolled students',
  })
  @IsOptional()
  @IsMongoId()
  courseId?: string;
}

export class StudentStudyDetailQueryDto {
  @ApiPropertyOptional({
    default: 14,
    minimum: 7,
    maximum: 90,
    description: 'Number of Vietnam calendar days for daily breakdown',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(7)
  @Max(90)
  days?: number = 14;
}
