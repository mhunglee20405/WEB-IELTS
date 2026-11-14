import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';
import { DashboardService } from './dashboard.service';

@ApiTags('Dashboard & Profiles')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('dashboard/student')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get aggregated student dashboard metrics and daily assignments' })
  getStudentDashboard(@CurrentUser() actor: UserDocument) {
    return this.dashboardService.getStudentDashboard(actor);
  }

  @Get('dashboard/teacher')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get aggregated teacher dashboard metrics and queue counts' })
  getTeacherDashboard(@CurrentUser() actor: UserDocument) {
    return this.dashboardService.getTeacherDashboard(actor);
  }

  @Get('students/me/profile')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get current student enriched profile' })
  getStudentProfile(@CurrentUser() actor: UserDocument) {
    return this.dashboardService.getStudentProfile(actor);
  }

  @Get('teachers/me/profile')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get current teacher enriched profile' })
  getTeacherProfile(@CurrentUser() actor: UserDocument) {
    return this.dashboardService.getTeacherProfile(actor);
  }

  @Get('students/:studentId/penalties')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Get penalties for a specific student' })
  @ApiParam({ name: 'studentId', description: 'Student User ObjectId' })
  getStudentPenalties(@Param('studentId') studentId: string) {
    return this.dashboardService.getStudentPenalties(studentId);
  }
}

