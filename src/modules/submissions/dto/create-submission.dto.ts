import { IsArray, ValidateNested, ArrayMinSize } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { SubmissionAnswerDto } from './submission-answer.dto';

export class CreateSubmissionDto {
  @ApiProperty({ type: [SubmissionAnswerDto], description: 'List of student answers' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SubmissionAnswerDto)
  answers: SubmissionAnswerDto[];
}
