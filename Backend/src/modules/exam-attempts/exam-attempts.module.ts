import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamAttempt, ExamAttemptSchema } from 'src/database/schemas/exam-attempt.schema';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import { Submission, SubmissionSchema } from 'src/database/schemas/submission.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import { ExamAttemptsController } from './exam-attempts.controller';
import { ExamAttemptsService } from './exam-attempts.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamAttempt.name, schema: ExamAttemptSchema },
      { name: ExamTest.name, schema: ExamTestSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: Submission.name, schema: SubmissionSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
  ],
  controllers: [ExamAttemptsController],
  providers: [ExamAttemptsService],
  exports: [ExamAttemptsService, MongooseModule],
})
export class ExamAttemptsModule {}

