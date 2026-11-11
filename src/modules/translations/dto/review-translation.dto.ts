import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReviewTranslationDto {
  @ApiProperty({
    example: 'Dịch rất lưu loát và sát nghĩa, đặc biệt là đoạn giải thích kỹ thuật nấu cát.',
    description: 'Teacher feedback and comments on the student translation',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  teacherComment: string;
}

