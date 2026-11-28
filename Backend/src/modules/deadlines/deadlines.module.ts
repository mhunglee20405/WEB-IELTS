import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DeadlinesController } from './deadlines.controller';
import { DeadlinesService } from './deadlines.service';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import {
  PenaltyTransaction,
  PenaltyTransactionSchema,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from 'src/database/schemas/student-profile.schema';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: PenaltyTransaction.name, schema: PenaltyTransactionSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
    ]),
    NotificationsModule,
  ],
  controllers: [DeadlinesController],
  providers: [DeadlinesService],
  exports: [DeadlinesService],
})
export class DeadlinesModule {}

