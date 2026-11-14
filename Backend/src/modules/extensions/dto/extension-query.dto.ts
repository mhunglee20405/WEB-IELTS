import { IsOptional, IsInt, Min, Max, IsEnum, IsMongoId } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExtensionRequestStatus } from 'src/database/schemas/enums';

export class ExtensionQueryDto {
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

  @ApiPropertyOptional({ enum: ExtensionRequestStatus })
  @IsOptional()
  @IsEnum(ExtensionRequestStatus)
  status?: ExtensionRequestStatus;

  @ApiPropertyOptional({ description: 'Filter by Course ObjectId' })
  @IsOptional()
  @IsMongoId()
  courseId?: string;

  @ApiPropertyOptional({ description: 'Filter by Student User ObjectId' })
  @IsOptional()
  @IsMongoId()
  studentId?: string;
}

