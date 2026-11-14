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
  ParseIntPipe,
  DefaultValuePipe,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { EnrollmentsService } from '../enrollments/enrollments.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { CourseQueryDto } from './dto/course-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole, EnrollmentStatus } from 'src/database/schemas/enums';
import { Types } from 'mongoose';

@ApiTags('Courses')
@Controller('courses')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class CoursesController {
  constructor(
    private readonly coursesService: CoursesService,
    private readonly enrollmentsService: EnrollmentsService,
  ) {}

  // ── POST /courses ─────────────────────────────────────────────────────
  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a new course (Admin only)' })
  create(@Body() dto: CreateCourseDto, @CurrentUser() actor: UserDocument) {
    return this.coursesService.create(dto, (actor._id as Types.ObjectId).toHexString());
  }

  // ── GET /courses/mine ─────────────────────────────────────────────────
  @Get('mine')
  @ApiOperation({ summary: 'List my courses (enrolled for student, assigned for teacher)' })
  findMine(@CurrentUser() actor: UserDocument, @Query() query: CourseQueryDto) {
    if (actor.role === UserRole.STUDENT) {
      return this.coursesService.findMine(actor, query);
    }
    return this.coursesService.findAll(actor, query);
  }

  // ── GET /courses ──────────────────────────────────────────────────────
  @Get()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List all courses (Admin: all; Teacher: assigned only)' })
  findAll(@CurrentUser() actor: UserDocument, @Query() query: CourseQueryDto) {
    return this.coursesService.findAll(actor, query);
  }

  // ── GET /courses/:id ──────────────────────────────────────────────────
  @Get(':id')
  @ApiOperation({ summary: 'Get course by ID (scoped by role)' })
  @ApiParam({ name: 'id', description: 'Course ObjectId' })
  findOne(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.coursesService.findById(id, actor);
  }

  // ── PATCH /courses/:id ────────────────────────────────────────────────
  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update course (Admin: all fields; Teacher: limited fields)' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.coursesService.update(id, dto, actor);
  }

  // ── DELETE /courses/:id ───────────────────────────────────────────────
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Archive (or delete unused draft) course (Admin only)',
    description:
      'Rejects if active enrollments exist. Archives instead of hard-deleting when enrollment/assignment/lesson history exists.',
  })
  remove(@Param('id') id: string) {
    return this.coursesService.remove(id);
  }

  // ── GET /courses/:id/students ─────────────────────────────────────────
  @Get(':id/students')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'List enrolled students in a course' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'status', required: false, enum: EnrollmentStatus })
  getStudents(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
    @Query('status') status?: EnrollmentStatus,
  ) {
    return this.coursesService.getStudents(
      id,
      actor,
      page,
      limit,
      status ?? EnrollmentStatus.ACTIVE,
    );
  }

  // ── POST /courses/:id/students ────────────────────────────────────────
  @Post(':id/students')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Enroll a student into a course' })
  addStudent(
    @Param('id') courseId: string,
    @Body() dto: AddStudentDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.enrollmentsService.enroll(courseId, dto.studentId, actor);
  }

  // ── DELETE /courses/:id/students/:studentId ───────────────────────────
  @Delete(':id/students/:studentId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove (drop) a student from a course' })
  removeStudent(
    @Param('id') courseId: string,
    @Param('studentId') studentId: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.enrollmentsService.drop(courseId, studentId, actor);
  }
}
