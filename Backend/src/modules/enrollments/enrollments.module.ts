import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { EnrollmentsService } from './enrollments.service';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import { User, UserSchema } from 'src/database/schemas/user.schema';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { AuditModule } from 'src/modules/audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: User.name, schema: UserSchema },
    ]),
    NotificationsModule,
    AuditModule,
  ],
  providers: [EnrollmentsService],
  exports: [EnrollmentsService],
})
export class EnrollmentsModule {}

