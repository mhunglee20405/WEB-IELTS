import { IsString, IsNumber, Min, IsIn } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AudioUploadIntentDto {
  @ApiProperty({ example: 'section1_recording.mp3' })
  @IsString()
  filename: string;

  @ApiProperty({ example: 'audio/mpeg' })
  @IsString()
  @IsIn(['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg', 'audio/m4a'])
  mimeType: string;

  @ApiProperty({ example: 10485760, description: 'File size in bytes (max 50MB)' })
  @IsNumber()
  @Min(1)
  fileSize: number;
}

