import { IsEmail } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ForgotPasswordDto {
  @ApiProperty({ example: 'student@example.com' })
  @IsEmail({}, { message: 'Định dạng email không hợp lệ.' })
  email: string;
}
