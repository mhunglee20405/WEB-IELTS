import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmissionAnswerDto {
  @ApiProperty({ example: 'q-mcq-1', description: 'Question ID' })
  @IsString()
  @IsNotEmpty()
  questionId: string;

  @ApiProperty({ example: 'B', description: 'Student answer (e.g. option key A/B/C/D, text, or T/F/NG)' })
  @IsString()
  value: string;
}
