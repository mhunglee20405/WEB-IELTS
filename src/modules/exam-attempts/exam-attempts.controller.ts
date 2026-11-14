import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
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
} from '@nestjs/swagger';
import { ExamAttemptsService } from './exam-attempts.service';
import {
  CreateExamAttemptDto,
  SaveAnswersDto,
  SubmitAttemptDto,
} from './dto/exam-attempt.dto';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';

@ApiTags('Exam Attempts (Session Engine)')
@Controller('exam-attempts')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class ExamAttemptsController {
  constructor(private readonly examAttemptsService: ExamAttemptsService) {}

  @Post()
  @ApiOperation({ summary: 'Start a new exam attempt (PART or FULL mode)' })
  createAttempt(
    @Body() dto: CreateExamAttemptDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.createAttempt(dto, actor);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get current attempt state, timer, and saved answers' })
  @ApiParam({ name: 'id', description: 'ExamAttempt ObjectId' })
  getAttempt(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.getAttempt(id, actor);
  }

  @Put(':id/answers')
  @ApiOperation({ summary: 'Autosave answers with optimistic revision concurrency' })
  @ApiParam({ name: 'id', description: 'ExamAttempt ObjectId' })
  saveAnswers(
    @Param('id') id: string,
    @Body() dto: SaveAnswersDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.saveAnswers(id, dto, actor);
  }

  @Post(':id/submit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit attempt for server-side auto-grading' })
  @ApiParam({ name: 'id', description: 'ExamAttempt ObjectId' })
  submitAttempt(
    @Param('id') id: string,
    @Body() dto: SubmitAttemptDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.submitAttempt(id, dto, actor);
  }

  @Get(':id/result')
  @ApiOperation({ summary: 'Get graded attempt result breakdown' })
  @ApiParam({ name: 'id', description: 'ExamAttempt ObjectId' })
  getResult(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.getResult(id, actor);
  }

  @Get(':id/review')
  @ApiOperation({ summary: 'Review answers and explanations (Unlocked ONLY when PASSED >= 70%)' })
  @ApiParam({ name: 'id', description: 'ExamAttempt ObjectId' })
  getReview(
    @Param('id') id: string,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.examAttemptsService.getReview(id, actor);
  }
}

