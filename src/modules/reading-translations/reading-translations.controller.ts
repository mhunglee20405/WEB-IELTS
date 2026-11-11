import {
  Controller,
  Get,
  Put,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ReadingTranslationsService } from './reading-translations.service';
import {
  SaveTranslationDraftDto,
  SubmitReadingTranslationDto,
  ReviewReadingTranslationDto,
  TeacherTranslationQueryDto,
} from './dto/reading-translation.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Reading Translations (Student)')
@Controller('reading-translations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ReadingTranslationsController {
  constructor(private readonly translationsService: ReadingTranslationsService) {}

  @Get('eligibility')
  @ApiOperation({ summary: 'Check per-passage translation unlock status for a Reading test' })
  @ApiQuery({ name: 'testId', required: true, description: 'ExamTest ObjectId' })
  @ApiQuery({ name: 'studentAssignmentId', required: false })
  getEligibility(
    @Query('testId') testId: string,
    @Query('studentAssignmentId') studentAssignmentId: string | undefined,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.getEligibility(testId, studentAssignmentId, actor);
  }

  @Get(':passageId')
  @ApiOperation({ summary: 'Get Reading passage text and existing draft/review status' })
  @ApiParam({ name: 'passageId', description: 'Passage (ExamPart) ObjectId' })
  @ApiQuery({ name: 'testId', required: true, description: 'ExamTest ObjectId' })
  @ApiQuery({ name: 'studentAssignmentId', required: false })
  getPassageTranslation(
    @Param('passageId') passageId: string,
    @Query('testId') testId: string,
    @Query('studentAssignmentId') studentAssignmentId: string | undefined,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.getPassageTranslation(passageId, testId, studentAssignmentId, actor);
  }

  @Put(':passageId/draft')
  @ApiOperation({ summary: 'Save Vietnamese translation draft (Requires passed attempt for this passage)' })
  @ApiParam({ name: 'passageId', description: 'Passage (ExamPart) ObjectId' })
  saveDraft(
    @Param('passageId') passageId: string,
    @Body() dto: SaveTranslationDraftDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.saveDraft(passageId, dto, actor);
  }

  @Post(':passageId/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit Vietnamese translation for teacher review' })
  @ApiParam({ name: 'passageId', description: 'Passage (ExamPart) ObjectId' })
  submitTranslation(
    @Param('passageId') passageId: string,
    @Body() dto: SubmitReadingTranslationDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.submitTranslation(passageId, dto, actor);
  }
}

@ApiTags('Teacher Reading Translations (Review)')
@Controller('teacher/reading-translations')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@ApiBearerAuth()
export class TeacherReadingTranslationsController {
  constructor(private readonly translationsService: ReadingTranslationsService) {}

  @Get()
  @ApiOperation({ summary: 'List submitted translations needing teacher review' })
  findAllForTeacher(
    @Query() query: TeacherTranslationQueryDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.findAllForTeacher(query, actor);
  }

  @Post(':translationId/review')
  @ApiOperation({ summary: 'Provide teacher feedback and mark translation as REVIEWED' })
  @ApiParam({ name: 'translationId', description: 'TranslationSubmission ObjectId' })
  review(
    @Param('translationId') translationId: string,
    @Body() dto: ReviewReadingTranslationDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.translationsService.reviewTranslation(translationId, dto, actor);
  }
}

