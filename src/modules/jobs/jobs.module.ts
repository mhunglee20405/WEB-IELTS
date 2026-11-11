import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import {
  EmailDelivery,
  EmailDeliverySchema,
} from 'src/database/schemas/email-delivery.schema';
import { MailModule } from 'src/modules/mail/mail.module';
import { DeadlinesModule } from 'src/modules/deadlines/deadlines.module';
import { QUEUE_DEADLINES, QUEUE_EMAIL } from './jobs.constants';
import { EmailProcessor } from './processors/email.processor';
import { DeadlineProcessor } from './processors/deadline.processor';
import { DeadlineScheduler } from './schedulers/deadline.scheduler';
import { JobsController } from './jobs.controller';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: QUEUE_EMAIL },
      { name: QUEUE_DEADLINES },
    ),
    MongooseModule.forFeature([
      { name: EmailDelivery.name, schema: EmailDeliverySchema },
    ]),
    MailModule,
    DeadlinesModule,
  ],
  controllers: [JobsController],
  providers: [EmailProcessor, DeadlineProcessor, DeadlineScheduler],
  exports: [BullModule, DeadlineScheduler],
})
export class JobsModule {}

