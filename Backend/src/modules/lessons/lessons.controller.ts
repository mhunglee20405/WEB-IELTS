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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { LessonsService } from './lessons.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { LessonQueryDto } from './dto/lesson-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Lessons')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class LessonsController {
  constructor(private readonly lessonsService: LessonsService) {}

  // ── POST /courses/:courseId/lessons ───────────────────────────────────
  @Post('courses/:courseId/lessons')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Create a lesson in a course (Admin or course Teacher)' })
  @ApiParam({ name: 'courseId', description: 'Course ObjectId' })
  create(
    @Param('courseId') courseId: string,
    @Body() dto: CreateLessonDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.lessonsService.create(courseId, dto, actor);
  }

  // ── GET /courses/:courseId/lessons ────────────────────────────────────
  @Get('courses/:courseId/lessons')
  @ApiOperation({
    summary: 'List lessons for a course (Admin, course Teacher, or enrolled Student)',
  })
  @ApiParam({ name: 'courseId', description: 'Course ObjectId' })
  findByCourse(
    @Param('courseId') courseId: string,
    @CurrentUser() actor: UserDocument,
    @Query() query: LessonQueryDto,
  ) {
    return this.lessonsService.findByCourse(courseId, actor, query);
  }

  // ── GET /lessons/mine ─────────────────────────────────────────────────
  @Get('lessons/mine')
  @ApiOperation({
    summary: 'List my calendar lessons (scoped by role, with Asia/Ho_Chi_Minh display times)',
  })
  findMine(@CurrentUser() actor: UserDocument, @Query() query: LessonQueryDto) {
    return this.lessonsService.findMine(actor, query);
  }

  // ── GET /lessons/:id ──────────────────────────────────────────────────
  @Get('lessons/:id')
  @ApiOperation({ summary: 'Get lesson by ID (scoped by role)' })
  @ApiParam({ name: 'id', description: 'Lesson ObjectId' })
  findOne(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.lessonsService.findById(id, actor);
  }

  // ── PATCH /lessons/:id ────────────────────────────────────────────────
  @Patch('lessons/:id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update lesson details or Meet URL (Admin or course Teacher)' })
  @ApiParam({ name: 'id', description: 'Lesson ObjectId' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.lessonsService.update(id, dto, actor);
  }

  // ── PATCH /lessons/:id/cancel ─────────────────────────────────────────
  @Patch('lessons/:id/cancel')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a lesson (soft-cancel, preserves history)' })
  @ApiParam({ name: 'id', description: 'Lesson ObjectId' })
  cancel(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.lessonsService.cancel(id, actor);
  }

  // ── DELETE /lessons/:id ───────────────────────────────────────────────
  @Delete('lessons/:id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a lesson via DELETE (soft-cancel, preserves history)' })
  @ApiParam({ name: 'id', description: 'Lesson ObjectId' })
  remove(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.lessonsService.cancel(id, actor);
  }
}

