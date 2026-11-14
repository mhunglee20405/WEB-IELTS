import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import {
  Notification,
  NotificationSchema,
} from 'src/database/schemas/notification.schema';
import {
  EmailDelivery,
  EmailDeliverySchema,
} from 'src/database/schemas/email-delivery.schema';
import { User, UserSchema } from 'src/database/schemas/user.schema';
import { QUEUE_EMAIL } from '../jobs/jobs.constants';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Notification.name, schema: NotificationSchema },
      { name: EmailDelivery.name, schema: EmailDeliverySchema },
      { name: User.name, schema: UserSchema },
    ]),
    BullModule.registerQueue({ name: QUEUE_EMAIL }),
  ],
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}

