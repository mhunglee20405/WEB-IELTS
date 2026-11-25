import { IsString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'reset-token-uuid' })
  @IsString()
  @MinLength(6, { message: 'Mã đặt lại mật khẩu không hợp lệ.' })
  token: string;

  @ApiProperty({ example: 'NewSecurePass@2026!', minLength: 8 })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' })
  @MaxLength(64, { message: 'Mật khẩu mới không được vượt quá 64 ký tự.' })
  newPassword: string;
}
