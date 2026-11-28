import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { NotificationType } from 'src/database/schemas/enums';

function parseBooleanQuery(value: unknown, obj: any, key: string): boolean | undefined {
  const raw = obj && obj[key] !== undefined ? obj[key] : value;
  if (raw === 'false' || raw === false || raw === '0' || raw === 0) return false;
  if (raw === 'true' || raw === true || raw === '1' || raw === 1) return true;
  return undefined;
}

export class NotificationQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;

  @ApiPropertyOptional({ description: 'Filter by read status (true/false)' })
  @IsOptional()
  @Transform(({ value, obj, key }) => parseBooleanQuery(value, obj, key))
  @IsBoolean()
  isRead?: boolean;

  @ApiPropertyOptional({ description: 'Alias for isRead' })
  @IsOptional()
  @Transform(({ value, obj, key }) => parseBooleanQuery(value, obj, key))
  @IsBoolean()
  read?: boolean;

  @ApiPropertyOptional({ enum: NotificationType, description: 'Filter by notification type' })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

