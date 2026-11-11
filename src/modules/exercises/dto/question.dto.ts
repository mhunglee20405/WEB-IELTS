import {
  IsString,
  IsEnum,
  IsOptional,
  IsNumber,
  Min,
  ValidateNested,
  IsArray,
  IsNotEmpty,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { QuestionType } from 'src/database/schemas/enums';
import { AnswerOptionDto } from './answer-option.dto';
import { AnswerSpecificationDto } from './answer-specification.dto';

export class QuestionDto {
  @ApiPropertyOptional({ description: 'Stable unique ID (auto-generated if omitted)' })
  @IsOptional()
  @IsString()
  questionId?: string;

  @ApiProperty({ enum: QuestionType })
  @IsEnum(QuestionType)
  type: QuestionType;

  @ApiProperty({ example: 'What is the main cause of global warming?' })
  @IsString()
  @IsNotEmpty()
  prompt: string;

  @ApiPropertyOptional({ type: [AnswerOptionDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AnswerOptionDto)
  options?: AnswerOptionDto[];

  @ApiProperty({ type: AnswerSpecificationDto })
  @ValidateNested()
  @Type(() => AnswerSpecificationDto)
  answerSpecification: AnswerSpecificationDto;

  @ApiProperty({ example: 1, minimum: 0 })
  @IsNumber()
  @Min(0)
  points: number;

  @ApiPropertyOptional({ example: 'Refer to paragraph 3 for explanation.' })
  @IsOptional()
  @IsString()
  explanation?: string;
}
