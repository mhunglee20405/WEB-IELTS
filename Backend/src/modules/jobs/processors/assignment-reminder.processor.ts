import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AssignmentReminderService } from '../assignment-reminder.service';
import { JOB_CHECK_TEACHER_SCHEDULE, QUEUE_REMINDERS } from '../jobs.constants';

@Processor(QUEUE_REMINDERS, {
  concurrency: 1,
})
export class AssignmentReminderProcessor extends WorkerHost {
  private readonly logger = new Logger(AssignmentReminderProcessor.name);

  constructor(private readonly assignmentReminderService: AssignmentReminderService) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== JOB_CHECK_TEACHER_SCHEDULE) {
      this.logger.debug(`Ignoring unknown job ${job.name} in queue ${QUEUE_REMINDERS}`);
      return { ignored: true };
    }

    this.logger.log(`[JOB ${job.id}] Executing teacher assignment schedule reminder check...`);

    try {
      const result = await this.assignmentReminderService.checkAndRemindTeachers();

      this.logger.log(
        `[JOB ${job.id}] Schedule reminder check complete: checked=${result.checkedCourses}, reminded=${result.remindedCount}, skipped=${result.skippedAlreadyReminded}, isoWeek=${result.isoWeek}`,
      );

      return result;
    } catch (err: any) {
      this.logger.error(
        `[JOB ${job.id}] Teacher schedule reminder check failed: ${err.message}`,
        err.stack,
      );
      throw err;
    }
  }
}
