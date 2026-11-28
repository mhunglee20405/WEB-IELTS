import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { TIMEZONE_VN } from 'src/common/constants';
import { JOB_CHECK_TEACHER_SCHEDULE, QUEUE_REMINDERS } from '../jobs.constants';

@Injectable()
export class AssignmentReminderScheduler implements OnModuleInit {
  private readonly logger = new Logger(AssignmentReminderScheduler.name);

  constructor(
    @InjectQueue(QUEUE_REMINDERS) private readonly reminderQueue: Queue,
    private readonly configService: ConfigService,
  ) {}

  async onModuleInit() {
    const isTest = this.configService.get<string>('nodeEnv') === 'test';

    // In non-test environments, register daily check at 08:00 Asia/Ho_Chi_Minh
    if (!isTest) {
      try {
        await this.reminderQueue.add(
          JOB_CHECK_TEACHER_SCHEDULE,
          {},
          {
            repeat: {
              pattern: '0 8 * * *',
              tz: TIMEZONE_VN,
            },
            jobId: 'teacher-assignment-schedule-reminder',
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        );
        this.logger.log(
          `Registered repeatable teacher assignment schedule reminder job (08:00 ${TIMEZONE_VN})`,
        );
      } catch (err: any) {
        this.logger.warn(`Could not register repeatable schedule reminder job: ${err.message}`);
      }
    }
  }

  /**
   * Manually trigger an immediate teacher assignment schedule reminder check
   */
  async triggerNow() {
    return await this.reminderQueue.add(
      JOB_CHECK_TEACHER_SCHEDULE,
      { triggeredAt: new Date().toISOString() },
      {
        jobId: `manual-reminder-${Date.now()}`,
        removeOnComplete: true,
      },
    );
  }
}
