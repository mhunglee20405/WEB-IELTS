import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/database/schemas/enums';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  BulkSaveUserVocabDto,
  CreatePassageVocabItemDto,
  CreateUserVocabDto,
  SyncPassageVocabDto,
  UpdatePassageVocabItemDto,
  UpdateUserVocabDto,
  UpdateUserVocabStatusDto,
  UserVocabQueryDto,
} from './dto/vocabulary.dto';
import { VocabularyService } from './vocabulary.service';

@ApiTags('Teacher Passage Vocabulary')
@Controller('teacher/passages/:passageId/vocabs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@ApiBearerAuth()
export class TeacherVocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get()
  @ApiOperation({ summary: 'List teacher key vocabulary attached to a Reading passage' })
  @ApiParam({ name: 'passageId', description: 'Reading ExamPart ObjectId' })
  list(@Param('passageId') passageId: string) {
    return this.vocabularyService.listTeacherPassageVocabs(passageId);
  }

  @Post()
  @ApiOperation({ summary: 'Add a key vocabulary item to a Reading passage' })
  @ApiParam({ name: 'passageId', description: 'Reading ExamPart ObjectId' })
  create(
    @Param('passageId') passageId: string,
    @Body() dto: CreatePassageVocabItemDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.vocabularyService.createTeacherPassageVocab(passageId, dto, actor);
  }

  @Put('sync')
  @ApiOperation({ summary: 'Replace/sync key vocabulary list for a Reading passage' })
  @ApiParam({ name: 'passageId', description: 'Reading ExamPart ObjectId' })
  sync(
    @Param('passageId') passageId: string,
    @Body() dto: SyncPassageVocabDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.vocabularyService.syncTeacherPassageVocabs(passageId, dto, actor);
  }

  @Patch(':vocabId')
  @ApiOperation({ summary: 'Update a Reading passage vocabulary item' })
  update(
    @Param('passageId') passageId: string,
    @Param('vocabId') vocabId: string,
    @Body() dto: UpdatePassageVocabItemDto,
  ) {
    return this.vocabularyService.updateTeacherPassageVocab(passageId, vocabId, dto);
  }

  @Delete(':vocabId')
  @ApiOperation({ summary: 'Remove a Reading passage vocabulary item' })
  remove(@Param('passageId') passageId: string, @Param('vocabId') vocabId: string) {
    return this.vocabularyService.deleteTeacherPassageVocab(passageId, vocabId);
  }
}

@ApiTags('Contextual Vocabulary Notebook')
@Controller('vocabulary')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class VocabularyController {
  constructor(private readonly vocabularyService: VocabularyService) {}

  @Get('passages/:passageId')
  @ApiOperation({ summary: 'Get recommended key vocabulary for a Reading passage' })
  @ApiParam({ name: 'passageId', description: 'Reading ExamPart ObjectId' })
  getPassageVocabs(@Param('passageId') passageId: string) {
    return this.vocabularyService.getStudentPassageVocabs(passageId);
  }

  @Get('notebook')
  @ApiOperation({ summary: 'List personal vocabulary notebook with search, filter and pagination' })
  listNotebook(@CurrentUser() actor: UserDocument, @Query() query: UserVocabQueryDto) {
    return this.vocabularyService.listStudentNotebook(actor, query);
  }

  @Post('notebook')
  @ApiOperation({ summary: 'Save a single word into personal vocabulary notebook' })
  createNotebookEntry(
    @CurrentUser() actor: UserDocument,
    @Body() dto: CreateUserVocabDto,
  ) {
    return this.vocabularyService.createStudentNotebookEntry(actor, dto);
  }

  @Post('notebook/bulk')
  @ApiOperation({ summary: 'Bulk save all teacher vocabulary of a Reading passage to notebook' })
  bulkSaveNotebook(
    @CurrentUser() actor: UserDocument,
    @Body() dto: BulkSaveUserVocabDto,
  ) {
    return this.vocabularyService.bulkSaveFromPassage(actor, dto);
  }

  @Patch('notebook/:id')
  @ApiOperation({ summary: 'Update full content of a personal vocabulary entry' })
  updateNotebookEntry(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
    @Body() dto: UpdateUserVocabDto,
  ) {
    return this.vocabularyService.updateStudentNotebookEntry(id, actor, dto);
  }

  @Patch('notebook/:id/status')
  @ApiOperation({ summary: 'Quickly toggle learning/mastered status of a personal vocabulary entry' })
  updateNotebookStatus(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
    @Body() dto: UpdateUserVocabStatusDto,
  ) {
    return this.vocabularyService.updateStudentNotebookStatus(id, actor, dto);
  }

  @Delete('notebook/:id')
  @ApiOperation({ summary: 'Delete an entry from personal vocabulary notebook' })
  deleteNotebookEntry(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.vocabularyService.deleteStudentNotebookEntry(id, actor);
  }
}
