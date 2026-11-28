import { ConflictException, ForbiddenException } from '@nestjs/common';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { ExamTest } from 'src/database/schemas/exam-test.schema';
import {
  PassageVocab,
  VocabPartOfSpeech,
} from 'src/database/schemas/passage-vocab.schema';
import {
  UserVocabNotebook,
  VocabReviewStatus,
} from 'src/database/schemas/user-vocab-notebook.schema';
import { UserRole, UserStatus } from 'src/database/schemas/enums';
import { UserDocument } from 'src/database/schemas/user.schema';
import { VocabularyService } from './vocabulary.service';

describe('VocabularyService', () => {
  let service: VocabularyService;
  let passageVocabModel: any;
  let notebookModel: any;
  let examTestModel: any;

  const teacher = {
    _id: new Types.ObjectId(),
    role: UserRole.TEACHER,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const student = {
    _id: new Types.ObjectId(),
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const otherStudent = {
    _id: new Types.ObjectId(),
    role: UserRole.STUDENT,
    status: UserStatus.ACTIVE,
  } as unknown as UserDocument;

  const mockExecQuery = (value: any) => ({
    sort: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    lean: jest.fn().mockReturnThis(),
    exec: jest.fn().mockResolvedValue(value),
  });

  beforeEach(async () => {
    passageVocabModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findOneAndDelete: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      deleteMany: jest.fn(),
      insertMany: jest.fn(),
    };

    notebookModel = {
      find: jest.fn(),
      findOne: jest.fn(),
      findById: jest.fn(),
      countDocuments: jest.fn(),
      create: jest.fn(),
      insertMany: jest.fn(),
    };

    examTestModel = {
      find: jest.fn().mockReturnValue(mockExecQuery([])),
      findOne: jest.fn().mockReturnValue(mockExecQuery(null)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VocabularyService,
        { provide: getModelToken(PassageVocab.name), useValue: passageVocabModel },
        { provide: getModelToken(UserVocabNotebook.name), useValue: notebookModel },
        { provide: getModelToken(ExamTest.name), useValue: examTestModel },
      ],
    }).compile();

    service = module.get<VocabularyService>(VocabularyService);
  });

  describe('Teacher Passage Vocabulary', () => {
    it('creates a key vocab entry and rejects duplicates on the same passage', async () => {
      const passageId = new Types.ObjectId().toHexString();
      passageVocabModel.findOne.mockReturnValue(mockExecQuery(null));
      passageVocabModel.countDocuments.mockReturnValue(mockExecQuery(0));
      passageVocabModel.create.mockImplementation(async (doc: any) => ({
        _id: new Types.ObjectId(),
        ...doc,
      }));

      const created = await service.createTeacherPassageVocab(
        passageId,
        {
          word: 'Bioluminescence',
          partOfSpeech: VocabPartOfSpeech.NOUN,
          ipa: '/ˌbaɪ.oʊˌluː.mɪˈnes.əns/',
          meaningVi: 'phát quang sinh học',
          paraphraseNote: 'emitting natural light',
        },
        teacher,
      );

      expect(created.word).toBe('Bioluminescence');
      expect(created.meaningVi).toBe('phát quang sinh học');

      passageVocabModel.findOne.mockReturnValue(mockExecQuery({ _id: new Types.ObjectId() }));
      await expect(
        service.createTeacherPassageVocab(
          passageId,
          { word: '  bioluminescence  ', meaningVi: 'phát sáng' },
          teacher,
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('syncs and deduplicates passage vocab items preserving order', async () => {
      const passageId = new Types.ObjectId().toHexString();
      passageVocabModel.deleteMany.mockReturnValue(mockExecQuery({ deletedCount: 1 }));
      passageVocabModel.insertMany.mockImplementation(async (docs: any[]) =>
        docs.map((d) => ({ _id: new Types.ObjectId(), ...d })),
      );

      const res = await service.syncTeacherPassageVocabs(
        passageId,
        {
          items: [
            { word: 'mitigate', partOfSpeech: VocabPartOfSpeech.VERB, meaningVi: 'giảm nhẹ' },
            { word: 'MITIGATE', partOfSpeech: VocabPartOfSpeech.VERB, meaningVi: 'trùng' },
            { word: 'resilient', partOfSpeech: VocabPartOfSpeech.ADJ, meaningVi: 'kiên cường' },
          ],
        },
        teacher,
      );

      expect(res.items).toHaveLength(2);
      expect(res.items[0]!.word).toBe('mitigate');
      expect(res.items[1]!.word).toBe('resilient');
    });
  });

  describe('Student Notebook', () => {
    it('prevents duplicate word within the same passage', async () => {
      const passageId = new Types.ObjectId().toHexString();
      notebookModel.findOne.mockReturnValue(mockExecQuery({ _id: new Types.ObjectId() }));

      await expect(
        service.createStudentNotebookEntry(student, {
          passageId,
          word: 'ubiquitous',
          meaningVi: 'phổ biến khắp nơi',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('bulk saves passage vocab while skipping already saved words', async () => {
      const passageId = new Types.ObjectId().toHexString();
      passageVocabModel.find.mockReturnValue(
        mockExecQuery([
          {
            _id: new Types.ObjectId(),
            word: 'habitat',
            partOfSpeech: VocabPartOfSpeech.NOUN,
            meaningVi: 'môi trường sống',
          },
          {
            _id: new Types.ObjectId(),
            word: 'endemic',
            partOfSpeech: VocabPartOfSpeech.ADJ,
            meaningVi: 'đặc hữu',
          },
        ]),
      );
      notebookModel.find.mockReturnValue(mockExecQuery([{ normalizedWord: 'habitat' }]));
      notebookModel.insertMany.mockImplementation(async (docs: any[]) =>
        docs.map((d) => ({ _id: new Types.ObjectId(), ...d })),
      );

      const res = await service.bulkSaveFromPassage(student, { passageId });
      expect(res.savedCount).toBe(1);
      expect(res.skippedCount).toBe(1);
      expect(res.items[0]!.word).toBe('endemic');
    });

    it('enforces user ownership on update, status toggle, and delete', async () => {
      const entryId = new Types.ObjectId().toHexString();
      const doc = {
        _id: new Types.ObjectId(entryId),
        userId: student._id,
        word: 'canopy',
        normalizedWord: 'canopy',
        partOfSpeech: VocabPartOfSpeech.NOUN,
        meaningVi: 'tán rừng',
        status: VocabReviewStatus.LEARNING,
        save: jest.fn().mockImplementation(async function (this: any) {
          return this;
        }),
        deleteOne: jest.fn().mockResolvedValue({ deletedCount: 1 }),
      };

      notebookModel.findById.mockReturnValue(mockExecQuery(doc));

      await expect(
        service.updateStudentNotebookStatus(entryId, otherStudent, {
          status: VocabReviewStatus.MASTERED,
        }),
      ).rejects.toThrow(ForbiddenException);

      const updated = await service.updateStudentNotebookStatus(entryId, student, {
        status: VocabReviewStatus.MASTERED,
      });
      expect(updated.status).toBe(VocabReviewStatus.MASTERED);

      const deleted = await service.deleteStudentNotebookEntry(entryId, student);
      expect(deleted.ok).toBe(true);
      expect(doc.deleteOne).toHaveBeenCalled();
    });
  });
});
