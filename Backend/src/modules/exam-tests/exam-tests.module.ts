import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import {
  ExamTestsController,
  TeacherExamTestsController,
} from './exam-tests.controller';
import { ExamTestsService } from './exam-tests.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: ExamTest.name, schema: ExamTestSchema },
    ]),
  ],
  controllers: [ExamTestsController, TeacherExamTestsController],
  providers: [ExamTestsService],
  exports: [ExamTestsService, MongooseModule],
})
export class ExamTestsModule {}

