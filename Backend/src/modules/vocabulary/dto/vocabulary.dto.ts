import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { VocabPartOfSpeech } from 'src/database/schemas/passage-vocab.schema';
import { VocabReviewStatus } from 'src/database/schemas/user-vocab-notebook.schema';

export class CreatePassageVocabItemDto {
  @ApiPropertyOptional({ description: 'Parent ExamTest ObjectId' })
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partNumber?: number;

  @ApiProperty({ example: 'bioluminescence' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  word: string;

  @ApiProperty({ enum: VocabPartOfSpeech, default: VocabPartOfSpeech.NOUN })
  @IsOptional()
  @IsEnum(VocabPartOfSpeech)
  partOfSpeech?: VocabPartOfSpeech;

  @ApiPropertyOptional({ example: '/ˌbaɪ.oʊˌluː.mɪˈnes.əns/' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ipa?: string;

  @ApiProperty({ example: 'hiện tượng phát quang sinh học' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaningVi: string;

  @ApiPropertyOptional({ example: 'glow = emit light = produce natural illumination' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paraphraseNote?: string;

  @ApiPropertyOptional({ example: 'Deep-sea creatures rely on bioluminescence to attract prey.' })
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  contextSentence?: string;
}

export class UpdatePassageVocabItemDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  word?: string;

  @ApiPropertyOptional({ enum: VocabPartOfSpeech })
  @IsOptional()
  @IsEnum(VocabPartOfSpeech)
  partOfSpeech?: VocabPartOfSpeech;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ipa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaningVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paraphraseNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  contextSentence?: string;
}

export class SyncPassageVocabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  partNumber?: number;

  @ApiProperty({ type: [CreatePassageVocabItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePassageVocabItemDto)
  items: CreatePassageVocabItemDto[];
}

export class CreateUserVocabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passageId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourcePassageTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(240)
  sourceTestTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourcePassageVocabId?: string;

  @ApiProperty({ example: 'ubiquitous' })
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  word: string;

  @ApiPropertyOptional({ enum: VocabPartOfSpeech, default: VocabPartOfSpeech.NOUN })
  @IsOptional()
  @IsEnum(VocabPartOfSpeech)
  partOfSpeech?: VocabPartOfSpeech;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ipa?: string;

  @ApiProperty({ example: 'phổ biến khắp nơi' })
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaningVi: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  contextSentence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  personalNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paraphraseNote?: string;

  @ApiPropertyOptional({ enum: VocabReviewStatus, default: VocabReviewStatus.LEARNING })
  @IsOptional()
  @IsEnum(VocabReviewStatus)
  status?: VocabReviewStatus;
}

export class BulkSaveUserVocabDto {
  @ApiProperty({ description: 'Reading passage ID' })
  @IsString()
  @MinLength(1)
  passageId: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  testId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourcePassageTitle?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  sourceTestTitle?: string;

  @ApiPropertyOptional({ type: [CreatePassageVocabItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreatePassageVocabItemDto)
  items?: CreatePassageVocabItemDto[];
}

export class UpdateUserVocabDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(160)
  word?: string;

  @ApiPropertyOptional({ enum: VocabPartOfSpeech })
  @IsOptional()
  @IsEnum(VocabPartOfSpeech)
  partOfSpeech?: VocabPartOfSpeech;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(160)
  ipa?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  meaningVi?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1200)
  contextSentence?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  personalNote?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  paraphraseNote?: string;

  @ApiPropertyOptional({ enum: VocabReviewStatus })
  @IsOptional()
  @IsEnum(VocabReviewStatus)
  status?: VocabReviewStatus;
}

export class UpdateUserVocabStatusDto {
  @ApiProperty({ enum: VocabReviewStatus })
  @IsEnum(VocabReviewStatus)
  status: VocabReviewStatus;
}

export class UserVocabQueryDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  passageId?: string;

  @ApiPropertyOptional({ enum: VocabReviewStatus })
  @IsOptional()
  @IsEnum(VocabReviewStatus)
  status?: VocabReviewStatus;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
