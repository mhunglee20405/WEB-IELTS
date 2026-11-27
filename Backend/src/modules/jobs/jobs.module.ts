import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { ConfigModule } from '@nestjs/config';
import {
  EmailDelivery,
  EmailDeliverySchema,
} from 'src/database/schemas/email-delivery.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import {
  Notification,
  NotificationSchema,
} from 'src/database/schemas/notification.schema';
import { MailModule } from 'src/modules/mail/mail.module';
import { DeadlinesModule } from 'src/modules/deadlines/deadlines.module';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { QUEUE_DEADLINES, QUEUE_EMAIL, QUEUE_REMINDERS } from './jobs.constants';
import { EmailProcessor } from './processors/email.processor';
import { DeadlineProcessor } from './processors/deadline.processor';
import { AssignmentReminderProcessor } from './processors/assignment-reminder.processor';
import { DeadlineScheduler } from './schedulers/deadline.scheduler';
import { AssignmentReminderScheduler } from './schedulers/assignment-reminder.scheduler';
import { AssignmentReminderService } from './assignment-reminder.service';
import { JobsController } from './jobs.controller';

@Module({
  imports: [
    ConfigModule,
    BullModule.registerQueue(
      { name: QUEUE_EMAIL },
      { name: QUEUE_DEADLINES },
      { name: QUEUE_REMINDERS },
    ),
    MongooseModule.forFeature([
      { name: EmailDelivery.name, schema: EmailDeliverySchema },
      { name: Course.name, schema: CourseSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Notification.name, schema: NotificationSchema },
    ]),
    MailModule,
    DeadlinesModule,
    NotificationsModule,
  ],
  controllers: [JobsController],
  providers: [
    EmailProcessor,
    DeadlineProcessor,
    AssignmentReminderProcessor,
    DeadlineScheduler,
    AssignmentReminderScheduler,
    AssignmentReminderService,
  ],
  exports: [
    BullModule,
    DeadlineScheduler,
    AssignmentReminderScheduler,
    AssignmentReminderService,
  ],
})
export class JobsModule {}

