import { IsString, IsOptional, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ReviewTranslationDto {
  @ApiPropertyOptional({
    example: 'Dịch rất lưu loát và sát nghĩa, đặc biệt là đoạn giải thích kỹ thuật nấu cát.',
    description: 'Teacher feedback and comments on the student translation',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  teacherComment?: string;

  @ApiPropertyOptional({
    example: 'Nhận xét chi tiết cho học viên...',
  })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  feedback?: string;

  @ApiPropertyOptional({
    example: 'approved',
    enum: ['approved', 'needs_revision', 'REVIEWED', 'NEEDS_REVISION'],
  })
  @IsOptional()
  @IsString()
  decision?: string;
}

