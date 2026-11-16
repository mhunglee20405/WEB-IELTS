import { IsEmail, IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ChangeEmailDto {
  @ApiProperty({ example: 'new-admin@ielts-lms.com' })
  @IsEmail({}, { message: 'Định dạng email mới không hợp lệ.' })
  newEmail: string;

  @ApiProperty({ example: 'CurrentPassword@123!' })
  @IsString()
  @MinLength(1, { message: 'Vui lòng cung cấp mật khẩu hiện tại để xác thực.' })
  currentPassword: string;
}
