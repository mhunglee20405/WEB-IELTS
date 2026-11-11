import { IsEnum, IsOptional, IsString, MaxLength, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ExtensionRequestStatus } from 'src/database/schemas/enums';

export class ReviewExtensionRequestDto {
  @ApiProperty({
    enum: [ExtensionRequestStatus.APPROVED, ExtensionRequestStatus.REJECTED],
    description: 'Decision status',
  })
  @IsEnum([ExtensionRequestStatus.APPROVED, ExtensionRequestStatus.REJECTED], {
    message: 'status must be either approved or rejected',
  })
  status: ExtensionRequestStatus.APPROVED | ExtensionRequestStatus.REJECTED;

  @ApiPropertyOptional({
    example: 'Đồng ý gia hạn thêm 2 ngày, chú ý hoàn thành đúng hạn mới.',
    description: 'Teacher/Admin comment on the review decision',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  reviewNote?: string;

  @ApiPropertyOptional({
    example: '2026-12-05T23:59:59.999Z',
    description: 'Optional custom approved deadline override. Defaults to student requested deadline.',
  })
  @IsOptional()
  @IsDateString()
  approvedDeadlineAt?: string;
}

