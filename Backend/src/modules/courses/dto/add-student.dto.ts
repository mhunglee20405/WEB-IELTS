import { IsMongoId } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddStudentDto {
  @ApiProperty({ description: 'Student user ID (ObjectId)' })
  @IsMongoId()
  studentId: string;
}

