import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { SubmissionsService } from './submissions.service';
import { CreateSubmissionDto } from './dto/create-submission.dto';
import { SubmissionQueryDto } from './dto/submission-query.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Submissions')
@Controller()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class SubmissionsController {
  constructor(private readonly submissionsService: SubmissionsService) {}

  @Post('assignments/:id/submissions')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary:
      'Submit answers for an assignment (Server-side auto-graded, unlocks answers only if PASS >= 70%)',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  submit(
    @Param('id') id: string,
    @Body() dto: CreateSubmissionDto,
    @CurrentUser() student: UserDocument,
  ) {
    return this.submissionsService.submit(id, dto, student);
  }

  @Get('assignments/:id/submissions/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: 'Get submission attempts and feedback for authenticated student',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  findMine(@Param('id') id: string, @CurrentUser() student: UserDocument) {
    return this.submissionsService.findMySubmissions(id, student);
  }

  @Get('assignments/:id/answers')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary:
      'Dedicated authorized endpoint to retrieve full answer keys and explanations (Student must have PASS status)',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  getAnswerKeys(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.submissionsService.getAnswerKeys(id, actor);
  }

  @Get('assignments/:id/submissions')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'List submissions for an assignment (Admin or course Teacher)',
  })
  @ApiParam({ name: 'id', description: 'Assignment ObjectId' })
  findAllForAssignment(
    @Param('id') id: string,
    @Query() query: SubmissionQueryDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.submissionsService.findAllForAssignment(id, query, actor);
  }

  @Get('submissions/:id')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({
    summary: 'Get individual submission details',
  })
  @ApiParam({ name: 'id', description: 'Submission ObjectId' })
  getSubmissionById(@Param('id') id: string, @CurrentUser() actor: UserDocument) {
    return this.submissionsService.getSubmissionById(id, actor);
  }
}
