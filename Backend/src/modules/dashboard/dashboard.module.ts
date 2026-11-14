import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DashboardController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import {
  Assignment,
  AssignmentSchema,
} from 'src/database/schemas/assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import {
  Enrollment,
  EnrollmentSchema,
} from 'src/database/schemas/enrollment.schema';
import { Lesson, LessonSchema } from 'src/database/schemas/lesson.schema';
import {
  ExtensionRequest,
  ExtensionRequestSchema,
} from 'src/database/schemas/extension-request.schema';
import {
  PenaltyTransaction,
  PenaltyTransactionSchema,
} from 'src/database/schemas/penalty-transaction.schema';
import {
  Notification,
  NotificationSchema,
} from 'src/database/schemas/notification.schema';
import {
  TranslationSubmission,
  TranslationSubmissionSchema,
} from 'src/database/schemas/translation-submission.schema';
import {
  StudentProfile,
  StudentProfileSchema,
} from 'src/database/schemas/student-profile.schema';
import {
  TeacherProfile,
  TeacherProfileSchema,
} from 'src/database/schemas/teacher-profile.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: Lesson.name, schema: LessonSchema },
      { name: ExtensionRequest.name, schema: ExtensionRequestSchema },
      { name: PenaltyTransaction.name, schema: PenaltyTransactionSchema },
      { name: Notification.name, schema: NotificationSchema },
      { name: TranslationSubmission.name, schema: TranslationSubmissionSchema },
      { name: StudentProfile.name, schema: StudentProfileSchema },
      { name: TeacherProfile.name, schema: TeacherProfileSchema },
    ]),
  ],
  controllers: [DashboardController],
  providers: [DashboardService],
  exports: [DashboardService],
})
export class DashboardModule {}
