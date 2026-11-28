import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class AdminResetPasswordDto {
  @ApiPropertyOptional({
    minLength: 8,
    maxLength: 128,
    description: 'Optional custom temporary password; if omitted, one is auto-generated',
  })
  @IsOptional()
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword?: string;

  @ApiPropertyOptional({
    default: true,
    description: 'Require the student to change password on next login',
  })
  @IsOptional()
  @IsBoolean()
  requirePasswordChange?: boolean;

  @ApiPropertyOptional({
    maxLength: 300,
    description: 'Optional reason recorded in AuditLog metadata',
  })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
