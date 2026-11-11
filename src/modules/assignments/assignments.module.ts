import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Exercise, ExerciseSchema } from 'src/database/schemas/exercise.schema';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import { NotificationsModule } from 'src/modules/notifications/notifications.module';
import { AuditModule } from 'src/modules/audit/audit.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Exercise.name, schema: ExerciseSchema },
      { name: ExamTest.name, schema: ExamTestSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
    ]),
    NotificationsModule,
    AuditModule,
  ],
  controllers: [AssignmentsController],
  providers: [AssignmentsService],
  exports: [AssignmentsService],
})
export class AssignmentsModule {}

