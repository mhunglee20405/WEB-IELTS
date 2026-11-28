import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
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
  CreateFeedbackDto,
  FeedbackQueryDto,
  UpdateFeedbackStatusDto,
} from './dto/feedback.dto';
import { FeedbacksService } from './feedbacks.service';

@ApiTags('Feedbacks')
@Controller('feedbacks')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class FeedbacksController {
  constructor(private readonly feedbacksService: FeedbacksService) {}

  @Post()
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Submit anonymous student feedback (max 5 per VN calendar day)',
  })
  create(
    @Body() dto: CreateFeedbackDto,
    @CurrentUser() student: UserDocument,
  ) {
    return this.feedbacksService.create(dto, student);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List anonymous student feedbacks with filters and unread count (Admin only)',
  })
  findAll(@Query() query: FeedbackQueryDto) {
    return this.feedbacksService.findAll(query);
  }

  @Patch(':id/status')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'Update feedback status and internal admin note (Admin only)',
  })
  @ApiParam({ name: 'id', description: 'Feedback ObjectId' })
  updateStatus(
    @Param('id') id: string,
    @Body() dto: UpdateFeedbackStatusDto,
    @CurrentUser() admin: UserDocument,
  ) {
    return this.feedbacksService.updateStatus(id, dto, admin);
  }
}
