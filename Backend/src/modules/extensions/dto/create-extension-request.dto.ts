import { IsMongoId, IsDateString, IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateExtensionRequestDto {
  @ApiProperty({ description: 'StudentAssignment ObjectId' })
  @IsMongoId()
  studentAssignmentId: string;

  @ApiProperty({
    example: '2026-12-05T23:59:59.999Z',
    description: 'Requested new deadline (must be later than current effective deadline)',
  })
  @IsDateString()
  requestedDeadlineAt: string;

  @ApiProperty({
    example: 'Bị ốm đột xuất phải đi khám tại bệnh viện, xin phép lùi hạn nộp 2 ngày.',
    description: 'Reason for requesting extension',
  })
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

