import { Controller, Get, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { RolesGuard } from 'src/common/guards/roles.guard';
import { Roles } from 'src/common/decorators/roles.decorator';
import { UserRole } from 'src/database/schemas/enums';
import { QUEUE_DEADLINES, QUEUE_EMAIL, QUEUE_REMINDERS } from './jobs.constants';
import { DeadlineScheduler } from './schedulers/deadline.scheduler';
import { AssignmentReminderService } from './assignment-reminder.service';

@ApiTags('Jobs')
@Controller('jobs')
@UseGuards(AuthGuard('jwt'), RolesGuard)
@ApiBearerAuth()
export class JobsController {
  constructor(
    private readonly deadlineScheduler: DeadlineScheduler,
    private readonly assignmentReminderService: AssignmentReminderService,
    @InjectQueue(QUEUE_EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_DEADLINES) private readonly deadlineQueue: Queue,
    @InjectQueue(QUEUE_REMINDERS) private readonly reminderQueue: Queue,
  ) {}

  @Post('deadlines/trigger')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Trigger an immediate background overdue processing job' })
  async triggerOverdueCheck() {
    const job = await this.deadlineScheduler.triggerNow();
    return {
      message: 'Background overdue check job enqueued',
      jobId: job.id,
      queue: QUEUE_DEADLINES,
    };
  }

  @Post('reminders/trigger')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Trigger teacher 1-week advance assignment scheduling reminder check immediately (Admin only)',
  })
  async triggerScheduleReminders() {
    return this.assignmentReminderService.checkAndRemindTeachers();
  }

  @Get('health')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Get BullMQ queues health and metrics (Admin only)' })
  async getQueueMetrics() {
    const [emailCounts, deadlineCounts, reminderCounts] = await Promise.all([
      this.emailQueue.getJobCounts(),
      this.deadlineQueue.getJobCounts(),
      this.reminderQueue.getJobCounts(),
    ]);

    return {
      emailQueue: emailCounts,
      deadlineQueue: deadlineCounts,
      reminderQueue: reminderCounts,
    };
  }
}

