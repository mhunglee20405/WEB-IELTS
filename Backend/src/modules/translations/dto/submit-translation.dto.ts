import { IsString, IsNotEmpty, MinLength, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TranslationSubmissionStatus } from 'src/database/schemas/enums';

export class SubmitTranslationDto {
  @ApiProperty({
    example: 'Kính được sản xuất lần đầu tiên tại Lưỡng Hà cổ đại vào khoảng 3500 TCN...',
    description: 'Vietnamese translation text of the Reading passage',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  translatedText: string;

  @ApiPropertyOptional({
    enum: [TranslationSubmissionStatus.DRAFT, TranslationSubmissionStatus.SUBMITTED],
    default: TranslationSubmissionStatus.SUBMITTED,
  })
  @IsOptional()
  @IsEnum(TranslationSubmissionStatus)
  status?: TranslationSubmissionStatus = TranslationSubmissionStatus.SUBMITTED;
}

