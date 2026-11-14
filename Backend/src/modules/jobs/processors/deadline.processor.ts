import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, Job } from 'bullmq';
import { Model } from 'mongoose';
import { DeadlinesService } from 'src/modules/deadlines/deadlines.service';
import {
  EmailDelivery,
  EmailDeliveryDocument,
} from 'src/database/schemas/email-delivery.schema';
import { EmailDeliveryStatus } from 'src/database/schemas/enums';
import { JOB_PROCESS_OVERDUE, JOB_SEND_EMAIL, QUEUE_DEADLINES, QUEUE_EMAIL } from '../jobs.constants';

@Processor(QUEUE_DEADLINES, {
  concurrency: 1, // Single-worker concurrency to prevent overlapping local queue batches
})
export class DeadlineProcessor extends WorkerHost {
  private readonly logger = new Logger(DeadlineProcessor.name);

  constructor(
    private deadlinesService: DeadlinesService,
    @InjectModel(EmailDelivery.name)
    private emailDeliveryModel: Model<EmailDeliveryDocument>,
    @InjectQueue(QUEUE_EMAIL)
    private emailQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<any, any, string>): Promise<any> {
    if (job.name !== JOB_PROCESS_OVERDUE) {
      this.logger.debug(`Ignoring unknown job ${job.name} in queue ${QUEUE_DEADLINES}`);
      return { ignored: true };
    }

    this.logger.log(`[JOB ${job.id}] Executing scheduled overdue assignments check...`);

    try {
      const result = await this.deadlinesService.processOverdueAssignments({ limit: 200 });

      this.logger.log(
        `[JOB ${job.id}] Overdue batch check complete: processed=${result.processedCount}, newPenalties=${result.newPenaltiesCount}`,
      );

      // Durable Outbox Sweep: dispatch any pending QUEUED email delivery records
      const sweptCount = await this.sweepOutbox();

      return {
        ...result,
        sweptOutboxCount: sweptCount,
      };
    } catch (err: any) {
      this.logger.error(`[JOB ${job.id}] Overdue processing failed: ${err.message}`, err.stack);
      throw err;
    }
  }

  /**
   * Sweeps pending email delivery outbox documents that were not previously enqueued
   * (e.g. if Redis was restarting or network temporarily dropped during creation).
   */
  private async sweepOutbox(): Promise<number> {
    try {
      const cutoff = new Date(Date.now() - 5000);
      const pending = await this.emailDeliveryModel
        .find({ status: EmailDeliveryStatus.QUEUED, createdAt: { $lt: cutoff } })
        .limit(50)
        .exec();

      let count = 0;
      for (const delivery of pending) {
        try {
          await this.emailQueue.add(
            JOB_SEND_EMAIL,
            { deliveryId: delivery._id.toString() },
            {
              jobId: delivery.idempotencyKey,
              attempts: 3,
              backoff: { type: 'exponential', delay: 1000 },
            },
          );
          count++;
        } catch (queueErr: any) {
          this.logger.warn(
            `Failed to enqueue outbox delivery ${delivery._id}: ${queueErr.message}`,
          );
        }
      }

      if (count > 0) {
        this.logger.log(`Outbox sweeper dispatched ${count} queued email deliveries to BullMQ`);
      }
      return count;
    } catch (err: any) {
      this.logger.warn(`Error during outbox sweep: ${err.message}`);
      return 0;
    }
  }
}
