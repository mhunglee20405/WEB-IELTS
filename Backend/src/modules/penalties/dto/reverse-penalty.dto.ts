import { IsString, IsNotEmpty, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ReversePenaltyDto {
  @ApiProperty({
    example: 'Học viên có giấy xác nhận nhập viện được duyệt muộn, hủy trừ điểm phạt.',
    description: 'Mandatory audit reason for reversing the penalty point',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  @MaxLength(500)
  reason: string;
}

