import { IsString, MinLength, MaxLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangePasswordDto {
  @ApiProperty({ example: 'OldPassword@123!' })
  @IsString()
  @MinLength(1, { message: 'Vui lòng cung cấp mật khẩu hiện tại.' })
  currentPassword: string;

  @ApiProperty({
    example: 'NewSecurePass@2026!',
    description: 'Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character',
  })
  @IsString()
  @MinLength(8, { message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' })
  @MaxLength(64, { message: 'Mật khẩu mới không được vượt quá 64 ký tự.' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-])[A-Za-z\d@$!%*?&#^_\-]{8,}$/, {
    message: 'Mật khẩu mới phải chứa ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&#^_-).',
  })
  newPassword: string;
}
