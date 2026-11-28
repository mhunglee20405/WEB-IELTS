import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import { ExamAttempt, ExamAttemptSchema } from 'src/database/schemas/exam-attempt.schema';
import {
  ExamTestsController,
  TeacherExamTestsController,
} from './exam-tests.controller';
import { ExamTestsService } from './exam-tests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamTest.name, schema: ExamTestSchema },
      { name: ExamAttempt.name, schema: ExamAttemptSchema },
    ]),
  ],
  controllers: [ExamTestsController, TeacherExamTestsController],
  providers: [ExamTestsService],
  exports: [ExamTestsService, MongooseModule],
})
export class ExamTestsModule {}

