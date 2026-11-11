import { IsString, IsOptional, IsArray, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AnswerSpecificationDto {
  @ApiPropertyOptional({
    example: 'A',
    description: 'For multiple_choice, true_false_not_given, yes_no_not_given, matching',
  })
  @IsOptional()
  @IsString()
  correctKey?: string;

  @ApiPropertyOptional({
    example: ['greenhouse gases', 'greenhouse gas'],
    description: 'For fill_blank, short_answer',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  acceptedAnswers?: string[];

  @ApiPropertyOptional({
    default: false,
    description: 'Whether short_answer matching is case-sensitive',
  })
  @IsOptional()
  @IsBoolean()
  caseSensitive?: boolean;
}
