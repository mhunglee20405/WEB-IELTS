import {
  Controller,
  Get,
  Post,
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
  ApiQuery,
} from '@nestjs/swagger';
import { DeadlinesService } from './deadlines.service';
import { ProcessOverdueDto } from './dto/process-overdue.dto';
import { Roles } from 'src/common/decorators/roles.decorator';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { UserDocument } from 'src/database/schemas/user.schema';
import { UserRole } from 'src/database/schemas/enums';

@ApiTags('Deadlines')
@Controller('deadlines')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class DeadlinesController {
  constructor(private readonly deadlinesService: DeadlinesService) {}

  @Post('process-overdue')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Controlled execution of overdue deadline processor and penalty generation (Idempotent)',
  })
  processOverdue(
    @Body() dto: ProcessOverdueDto,
    @CurrentUser() actor: UserDocument,
  ) {
    return this.deadlinesService.processOverdueAssignments(dto, actor);
  }

  @Get('overdue')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({
    summary: 'List overdue student assignments by course or system-wide',
  })
  @ApiQuery({ name: 'courseId', required: false, type: String })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  getOverdueAssignments(
    @Query('courseId') courseId?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @CurrentUser() actor?: UserDocument,
  ) {
    return this.deadlinesService.getOverdueAssignments(courseId, actor, page, limit);
  }
}

