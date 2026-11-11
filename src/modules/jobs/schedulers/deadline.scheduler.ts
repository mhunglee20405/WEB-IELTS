import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { JOB_PROCESS_OVERDUE, QUEUE_DEADLINES } from '../jobs.constants';

@Injectable()
export class DeadlineScheduler implements OnModuleInit {
  private readonly logger = new Logger(DeadlineScheduler.name);

  constructor(
    @InjectQueue(QUEUE_DEADLINES) private deadlineQueue: Queue,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    const isTest = this.configService.get<string>('nodeEnv') === 'test';

    // In non-test environments, register a repeatable check every 1 minute
    if (!isTest) {
      try {
        await this.deadlineQueue.add(
          JOB_PROCESS_OVERDUE,
          {},
          {
            repeat: { every: 60000 },
            jobId: 'repeatable-deadline-check',
            removeOnComplete: 20,
            removeOnFail: 50,
          },
        );
        this.logger.log('Registered repeatable overdue checking job (every 60s)');
      } catch (err: any) {
        this.logger.warn(`Could not register repeatable overdue job: ${err.message}`);
      }
    }
  }

  /**
   * Manually trigger an immediate overdue processing job
   */
  async triggerNow() {
    return await this.deadlineQueue.add(
      JOB_PROCESS_OVERDUE,
      { triggeredAt: new Date().toISOString() },
      {
        jobId: `manual-overdue-${Date.now()}`,
        removeOnComplete: true,
      },
    );
  }
}

