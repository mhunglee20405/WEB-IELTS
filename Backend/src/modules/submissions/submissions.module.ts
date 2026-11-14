import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { SubmissionsController } from './submissions.controller';
import { StudentAssignmentsController } from './student-assignments.controller';
import { SubmissionsService } from './submissions.service';
import { Submission, SubmissionSchema } from 'src/database/schemas/submission.schema';
import { Assignment, AssignmentSchema } from 'src/database/schemas/assignment.schema';
import { Course, CourseSchema } from 'src/database/schemas/course.schema';
import {
  StudentAssignment,
  StudentAssignmentSchema,
} from 'src/database/schemas/student-assignment.schema';
import {
  TranslationSubmission,
  TranslationSubmissionSchema,
} from 'src/database/schemas/translation-submission.schema';
import { TranslationsModule } from 'src/modules/translations/translations.module';
import { ExtensionRequestsModule } from 'src/modules/extensions/extensions.module';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Submission.name, schema: SubmissionSchema },
      { name: Assignment.name, schema: AssignmentSchema },
      { name: Course.name, schema: CourseSchema },
      { name: StudentAssignment.name, schema: StudentAssignmentSchema },
      { name: TranslationSubmission.name, schema: TranslationSubmissionSchema },
    ]),
    forwardRef(() => TranslationsModule),
    forwardRef(() => ExtensionRequestsModule),
  ],
  controllers: [SubmissionsController, StudentAssignmentsController],
  providers: [SubmissionsService],
  exports: [SubmissionsService],
})
export class SubmissionsModule {}
