import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { ExamTestsService } from './exam-tests.service';
import {
  CreateExamTestDto,
  UpdateExamTestDto,
  CreateExamPartDto,
  UpdateExamPartDto,
  CreateQuestionGroupDto,
  UpdateQuestionGroupDto,
  ExamTestQueryDto,
} from './dto/exam-test.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, ExamMode } from 'src/database/schemas/enums';

@ApiTags('Exam Tests (Student & Public)')
@Controller('exam-tests')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ExamTestsController {
  constructor(private readonly examTestsService: ExamTestsService) {}

  @Get()
  @ApiOperation({ summary: 'List published exam tests for practice (Student safe)' })
  findAll(@Query() query: ExamTestQueryDto) {
    return this.examTestsService.findAllPublished(query);
  }

  @Get(':testId')
  @ApiOperation({ summary: 'Get published exam test metadata and parts (Student safe)' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  findOne(@Param('testId') testId: string, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.findByIdStudent(testId, actor);
  }

  @Get(':testId/parts/:partId')
  @ApiOperation({ summary: 'Get part questions (Student safe - answers stripped)' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiParam({ name: 'partId', description: 'ExamPart ObjectId' })
  findPart(
    @Param('testId') testId: string,
    @Param('partId') partId: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.findPartStudent(testId, partId, actor);
  }
}

@ApiTags('Teacher Exam Tests (Question Bank)')
@Controller('teacher/exam-tests')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
@ApiBearerAuth()
export class TeacherExamTestsController {
  constructor(private readonly examTestsService: ExamTestsService) {}

  @Get()
  @ApiOperation({ summary: 'List tests managed by teacher/admin' })
  findAll(@CurrentUser() actor: UserDocument, @Query() query: ExamTestQueryDto) {
    return this.examTestsService.findAllTeacher(actor, query);
  }

  @Post()
  @ApiOperation({ summary: 'Create new exam test in DRAFT status' })
  create(@Body() dto: CreateExamTestDto, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.create(dto, actor);
  }

  @Get(':testId')
  @ApiOperation({ summary: 'Get full exam test details including answer keys for authoring' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  findOne(@Param('testId') testId: string, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.findByIdTeacher(testId, actor);
  }

  @Patch(':testId')
  @ApiOperation({ summary: 'Update exam test metadata (DRAFT only)' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  update(
    @Param('testId') testId: string,
    @Body() dto: UpdateExamTestDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.update(testId, dto, actor);
  }

  @Post(':testId/parts')
  @ApiOperation({ summary: 'Add a Reading Passage or Listening Section to DRAFT test' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  addPart(
    @Param('testId') testId: string,
    @Body() dto: CreateExamPartDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.addPart(testId, dto, actor);
  }

  @Patch(':testId/parts/:partId')
  @ApiOperation({ summary: 'Update passage/section in DRAFT test' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiParam({ name: 'partId', description: 'ExamPart ObjectId' })
  updatePart(
    @Param('testId') testId: string,
    @Param('partId') partId: string,
    @Body() dto: UpdateExamPartDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.updatePart(testId, partId, dto, actor);
  }

  @Delete(':testId/parts/:partId')
  @ApiOperation({ summary: 'Delete passage/section from DRAFT test' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiParam({ name: 'partId', description: 'ExamPart ObjectId' })
  deletePart(
    @Param('testId') testId: string,
    @Param('partId') partId: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.deletePart(testId, partId, actor);
  }

  @Post(':testId/parts/:partId/question-groups')
  @ApiOperation({ summary: 'Add a question group with questions to a part in DRAFT test' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiParam({ name: 'partId', description: 'ExamPart ObjectId' })
  addQuestionGroup(
    @Param('testId') testId: string,
    @Param('partId') partId: string,
    @Body() dto: CreateQuestionGroupDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.addQuestionGroup(testId, partId, dto, actor);
  }

  @Patch(':testId/question-groups/:groupId')
  @ApiOperation({ summary: 'Update question group and questions in DRAFT test' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiParam({ name: 'groupId', description: 'QuestionGroup ObjectId' })
  updateQuestionGroup(
    @Param('testId') testId: string,
    @Param('groupId') groupId: string,
    @Body() dto: UpdateQuestionGroupDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examTestsService.updateQuestionGroup(testId, groupId, dto, actor);
  }

  @Post(':testId/validate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Validate completeness and question numbers before publishing' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  validateTest(@Param('testId') testId: string, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.validateTest(testId, actor);
  }

  @Get(':testId/preview')
  @ApiOperation({ summary: 'Preview test exactly as students will see it' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  @ApiQuery({ name: 'mode', enum: ExamMode, required: false })
  @ApiQuery({ name: 'partId', required: false })
  preview(
    @Param('testId') testId: string,
    @CurrentUser() actor: UserDocument,
    @Query('mode') mode?: ExamMode,
    @Query('partId') partId?: string,
  ) {
    return this.examTestsService.preview(testId, actor, mode, partId);
  }

  @Post(':testId/publish')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Publish exam test and make its current version immutable' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  publish(@Param('testId') testId: string, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.publish(testId, actor);
  }

  @Post(':testId/new-version')
  @ApiOperation({ summary: 'Fork a published test into a new editable DRAFT version' })
  @ApiParam({ name: 'testId', description: 'ExamTest ObjectId' })
  newVersion(@Param('testId') testId: string, @CurrentUser() actor: UserDocument) {
    return this.examTestsService.newVersion(testId, actor);
  }
}

