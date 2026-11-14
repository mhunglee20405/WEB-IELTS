import {
  Controller,
  Get,
  Post,
  Patch,
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
import { AssignmentsService } from './assignments.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { AssignmentQueryDto } from './dto/assignment-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Assignments')
@Controller('assignments')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class AssignmentsController {
  constructor(private readonly assignmentsService: AssignmentsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Create assignment for a course (Admin or course Teacher)' })
  create(@Body() dto: CreateAssignmentDto, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.create(dto, actor);
  }

  @Post('validate')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Validate assignment configuration before scheduling' })
  validate(@Body() dto: CreateAssignmentDto, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.validateAssignment(dto, actor);
  }

  @Post('preview')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Preview assignment structure, questions, and enrolled students' })
  preview(@Body() dto: CreateAssignmentDto, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.previewAssignment(dto, actor);
  }

  @Get(':id/preview')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Preview existing assignment structure (Teacher/Admin)' })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  previewById(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.previewById(id, actor);
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List assignments (Admin or assigned Teacher only)' })
  findAll(@CurrentUser() actor: UserDocument, @Query() query: AssignmentQueryDto) {
    return this.assignmentsService.findAll(actor, query);
  }

  @Get('course/:courseId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiOperation({ summary: 'List assignments for a specific course' })
  findByCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() actor: UserDocument,
    @Query() query: AssignmentQueryDto,
  ) {
    query.courseId = courseId;
    return this.assignmentsService.findAll(actor, query);
  }

  @Get('mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: 'Get assigned tasks and progress for authenticated student' })
  findMine(@CurrentUser() actor: UserDocument, @Query() query: AssignmentQueryDto) {
    return this.assignmentsService.findMine(actor, query);
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.STUDENT)
  @ApiOperation({
    summary:
      'Get assignment details (Student receives strictly sanitized snapshot without answer keys)',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  findOne(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.findById(id, actor);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update permitted assignment metadata and dates' })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateAssignmentDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.assignmentsService.update(id, dto, actor);
  }

  @Get(':id/students')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Get student roster and progress for an assignment' })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getStudents(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.assignmentsService.getStudents(id, actor, page, limit);
  }

  @Post(':id/backfill-students')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Backfill student_assignments for newly enrolled students after assignment was published',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  backfillStudents(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.assignmentsService.backfillStudents(id, actor);
  }
}

