import {
  IsEmail,
  IsString,
  IsOptional,
  MinLength,
  MaxLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BootstrapAdminDto {
  @ApiProperty({ example: 'Administrator', minLength: 2, maxLength: 100 })
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ example: 'admin@customer.com' })
  @IsEmail()
  email: string;

  @ApiProperty({
    example: 'AdminPass@2026!',
    description: 'Minimum 8 characters, at least 1 uppercase, 1 lowercase, 1 digit, and 1 special character',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(64)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-])[A-Za-z\d@$!%*?&#^_\-]{8,}$/, {
    message: 'Mật khẩu phải chứa ít nhất 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt (@$!%*?&#^_-).',
  })
  password: string;

  @ApiPropertyOptional({ example: '0901234567' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ description: 'Setup token if required by server configuration' })
  @IsOptional()
  @IsString()
  setupToken?: string;
}
