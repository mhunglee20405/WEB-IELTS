import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  PassageVocab,
  PassageVocabSchema,
} from 'src/database/schemas/passage-vocab.schema';
import {
  UserVocabNotebook,
  UserVocabNotebookSchema,
} from 'src/database/schemas/user-vocab-notebook.schema';
import { ExamTest, ExamTestSchema } from 'src/database/schemas/exam-test.schema';
import {
  TeacherVocabularyController,
  VocabularyController,
} from './vocabulary.controller';
import { VocabularyService } from './vocabulary.service';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: PassageVocab.name, schema: PassageVocabSchema },
      { name: UserVocabNotebook.name, schema: UserVocabNotebookSchema },
      { name: ExamTest.name, schema: ExamTestSchema },
    ]),
  ],
  controllers: [TeacherVocabularyController, VocabularyController],
  providers: [VocabularyService],
  exports: [VocabularyService, MongooseModule],
})
export class VocabularyModule {}
