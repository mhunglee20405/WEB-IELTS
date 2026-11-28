import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TranslationSubmission,
  TranslationSubmissionSchema,
} from 'src/database/schemas/translation-submission.schema';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import { ExamAttempt, ExamAttemptSchema } from 'src/database/schemas/exam-attempt.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import { Enrollment, EnrollmentSchema } from 'src/database/schemas/enrollment.schema';
import {
  ReadingTranslationsController,
  TeacherReadingTranslationsController,
} from './reading-translations.controller';
import { ReadingTranslationsService } from './reading-translations.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranslationSubmission.name, schema: TranslationSubmissionSchema },
      { name: ExamTest.name, schema: ExamTestSchema },
      { name: ExamAttempt.name, schema: ExamAttemptSchema },
      { name: Course.name, schema: CourseSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: Enrollment.name, schema: EnrollmentSchema },
    ]),
  ],
  controllers: [
    ReadingTranslationsController,
    TeacherReadingTranslationsController,
  ],
  providers: [ReadingTranslationsService],
  exports: [ReadingTranslationsService, MongooseModule],
})
export class ReadingTranslationsModule {}

