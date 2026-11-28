import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { UserRole } from 'src/database/schemas/enums';
import { UserDocument } from 'src/database/schemas/user.schema';
import {
  StudentStudyDetailQueryDto,
  StudyHeartbeatDto,
  TeacherStudySummaryQueryDto,
} from './dto/study-session.dto';
import { StudySessionsService } from './study-sessions.service';

@ApiTags('Study Sessions')
@Controller('study-sessions')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class StudySessionsController {
  constructor(private readonly studySessionsService: StudySessionsService) {}

  @Post('heartbeat')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Record active student study-time heartbeat (server-clamped 1..90s)',
  })
  heartbeat(
    @Body() dto: StudyHeartbeatDto,
    @CurrentUser() student: UserDocument,
  ) {
    return this.studySessionsService.heartbeat(dto, student);
  }

  @Get('me/summary')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Get authenticated student study-time totals and 14-day breakdown',
  })
  getMySummary(@CurrentUser() student: UserDocument) {
    return this.studySessionsService.getMySummary(student);
  }

  @Get('teacher/summary')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get study-time summary for enrolled students (Teacher/Admin)',
  })
  getTeacherSummary(
    @Query() query: TeacherStudySummaryQueryDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.studySessionsService.getTeacherSummary(query, actor);
  }

  @Get('students/:studentId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get detailed daily study-time breakdown for a student (Teacher/Admin)',
  })
  @ApiParam({ name: 'studentId', description: 'Student User ObjectId' })
  getStudentDetail(
    @Param('studentId') studentId: string,
    @Query() query: StudentStudyDetailQueryDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.studySessionsService.getStudentDetail(studentId, query, actor);
  }
}
