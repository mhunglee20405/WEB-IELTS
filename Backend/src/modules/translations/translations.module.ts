import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { TranslationsController } from './translations.controller';
import { TranslationsService } from './translations.service';
import {
  TranslationSubmission,
  TranslationSubmissionSchema,
} from 'src/database/schemas/translation-submission.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TranslationSubmission.name, schema: TranslationSubmissionSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
    ]),
  ],
  controllers: [TranslationsController],
  providers: [TranslationsService],
  exports: [TranslationsService],
})
export class TranslationsModule {}

