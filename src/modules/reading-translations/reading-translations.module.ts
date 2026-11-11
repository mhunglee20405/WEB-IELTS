import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TranslationSubmission,
  TranslationSubmissionSchema,
} from 'src/database/schemas/translation-submission.schema';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import { ExamAttempt, ExamAttemptSchema } from 'src/database/schemas/exam-attempt.schema';
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

