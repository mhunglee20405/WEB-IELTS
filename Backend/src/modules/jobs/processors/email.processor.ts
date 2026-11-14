import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Job } from 'bullmq';
import { Model } from 'mongoose';
import { EmailDeliveryStatus } from 'src/database/schemas/enums';
import {
  EmailDelivery,
  EmailDeliveryDocument,
} from 'src/database/schemas/email-delivery.schema';
import { MailService } from 'src/modules/mail/mail.service';
import { JOB_SEND_EMAIL, QUEUE_EMAIL } from '../jobs.constants';

@Processor(QUEUE_EMAIL, {
  concurrency: 5,
})
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    @InjectModel(EmailDelivery.name)
    private emailDeliveryModel: Model<EmailDeliveryDocument>,
    private mailService: MailService,
  ) {
    super();
  }

  async process(job: Job<{ deliveryId: string }, any, string>): Promise<any> {
    if (job.name !== JOB_SEND_EMAIL) {
      this.logger.debug(`Ignoring unknown job name ${job.name} in queue ${QUEUE_EMAIL}`);
      return { ignored: true };
    }

    const { deliveryId } = job.data;
    const delivery = await this.emailDeliveryModel.findById(deliveryId).exec();

    if (!delivery) {
      this.logger.warn(`EmailDelivery record ${deliveryId} not found, job ${job.id} aborted`);
      return { skipped: true, reason: 'Record not found' };
    }

    if (delivery.status === EmailDeliveryStatus.SENT) {
      this.logger.log(`EmailDelivery ${deliveryId} already SENT, skipping duplicate`);
      return { skipped: true, reason: 'Already sent' };
    }

    try {
      this.logger.log(
        `[JOB ${job.id}] Processing email delivery ${deliveryId} to ${delivery.recipientEmail} (Attempt ${job.attemptsMade + 1})`,
      );

      const rendered = this.mailService.renderTemplate(delivery.templateKey, delivery.payload || {});
      const result = await this.mailService.sendMail({
        to: delivery.recipientEmail,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      });

      delivery.status = EmailDeliveryStatus.SENT;
      delivery.providerMessageId = result.messageId;
      delivery.sentAt = new Date();
      delivery.attemptCount = job.attemptsMade + 1;
      delivery.errorMessage = undefined;
      await delivery.save();

      this.logger.log(`[JOB ${job.id}] Email delivered successfully: messageId=${result.messageId}`);
      return { success: true, messageId: result.messageId };
    } catch (err: any) {
      this.logger.error(
        `[JOB ${job.id}] Failed to send email to ${delivery.recipientEmail}: ${err.message}`,
        err.stack,
      );

      delivery.attemptCount = job.attemptsMade + 1;
      delivery.errorMessage = err.message;
      const maxAttempts = job.opts.attempts || 3;
      if (job.attemptsMade + 1 >= maxAttempts) {
        delivery.status = EmailDeliveryStatus.FAILED;
      }
      await delivery.save();

      throw err; // Trigger BullMQ backoff retry
    }
  }
}

