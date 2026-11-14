import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AnswerOptionDto {
  @ApiProperty({ example: 'A' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ example: 'True / First option' })
  @IsString()
  @IsNotEmpty()
  text: string;
}
