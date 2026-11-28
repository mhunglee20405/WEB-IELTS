import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  PassageVocab,
  PassageVocabDocument,
  VocabPartOfSpeech,
} from 'src/database/schemas/passage-vocab.schema';
import {
  UserVocabNotebook,
  UserVocabNotebookDocument,
  VocabReviewStatus,
} from 'src/database/schemas/user-vocab-notebook.schema';
import { ExamTest, ExamTestDocument } from 'src/database/schemas/exam-test.schema';
import { UserDocument } from 'src/database/schemas/user.schema';
import { extractObjectId } from 'src/modules/exam-tests/mappers/exam-test.mapper';
import {
  BulkSaveUserVocabDto,
  CreatePassageVocabItemDto,
  CreateUserVocabDto,
  SyncPassageVocabDto,
  UpdatePassageVocabItemDto,
  UpdateUserVocabDto,
  UpdateUserVocabStatusDto,
  UserVocabQueryDto,
} from './dto/vocabulary.dto';

function normalizeWordValue(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export interface ResolvedPassageInfo {
  passageId: string;
  testId?: string;
  testTitle?: string;
  passageTitle?: string;
  partNumber?: number;
}

@Injectable()
export class VocabularyService {
  constructor(
    @InjectModel(PassageVocab.name)
    private readonly passageVocabModel: Model<PassageVocabDocument>,
    @InjectModel(UserVocabNotebook.name)
    private readonly notebookModel: Model<UserVocabNotebookDocument>,
    @Optional()
    @InjectModel(ExamTest.name)
    private readonly examTestModel?: Model<ExamTestDocument>,
  ) {}

  private mapPassageVocab(doc: any) {
    return {
      id: extractObjectId(doc._id),
      passageId: doc.passageId,
      testId: doc.testId ? extractObjectId(doc.testId) : undefined,
      partNumber: doc.partNumber,
      word: doc.word,
      partOfSpeech: doc.partOfSpeech ?? VocabPartOfSpeech.NOUN,
      ipa: doc.ipa || undefined,
      meaningVi: doc.meaningVi,
      paraphraseNote: doc.paraphraseNote || undefined,
      contextSentence: doc.contextSentence || undefined,
      order: doc.order ?? 0,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : undefined,
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : undefined,
    };
  }

  private mapNotebookItem(doc: any, passageMetaMap?: Map<string, ResolvedPassageInfo>) {
    const pid = doc.passageId || undefined;
    const meta = pid ? passageMetaMap?.get(pid) : undefined;
    return {
      id: extractObjectId(doc._id),
      userId: extractObjectId(doc.userId),
      passageId: pid,
      testId: doc.testId ? extractObjectId(doc.testId) : meta?.testId,
      sourcePassageTitle: doc.sourcePassageTitle || meta?.passageTitle || undefined,
      sourceTestTitle: doc.sourceTestTitle || meta?.testTitle || undefined,
      sourcePassageVocabId: doc.sourcePassageVocabId
        ? extractObjectId(doc.sourcePassageVocabId)
        : undefined,
      word: doc.word,
      partOfSpeech: doc.partOfSpeech ?? VocabPartOfSpeech.NOUN,
      ipa: doc.ipa || undefined,
      meaningVi: doc.meaningVi,
      contextSentence: doc.contextSentence || undefined,
      personalNote: doc.personalNote || undefined,
      paraphraseNote: doc.paraphraseNote || undefined,
      status: doc.status ?? VocabReviewStatus.LEARNING,
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString(),
      updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : new Date().toISOString(),
    };
  }

  private async resolvePassageMetadata(passageId: string): Promise<ResolvedPassageInfo> {
    const cleanId = passageId.trim();
    if (!this.examTestModel || !Types.ObjectId.isValid(cleanId)) {
      return { passageId: cleanId };
    }

    const test = await this.examTestModel
      .findOne({ 'parts._id': new Types.ObjectId(cleanId) })
      .select('title parts._id parts.title parts.ordinal')
      .lean()
      .exec();

    if (!test) {
      return { passageId: cleanId };
    }

    const part = (test.parts || []).find((p: any) => extractObjectId(p._id) === cleanId);
    return {
      passageId: cleanId,
      testId: extractObjectId(test._id),
      testTitle: test.title,
      passageTitle: part?.title,
      partNumber: part?.ordinal,
    };
  }

  private async resolveManyPassageMetadata(
    passageIds: string[],
  ): Promise<Map<string, ResolvedPassageInfo>> {
    const map = new Map<string, ResolvedPassageInfo>();
    if (!this.examTestModel || passageIds.length === 0) {
      return map;
    }

    const objectIds = passageIds
      .filter((id) => Types.ObjectId.isValid(id))
      .map((id) => new Types.ObjectId(id));
    if (objectIds.length === 0) {
      return map;
    }

    const tests = await this.examTestModel
      .find({ 'parts._id': { $in: objectIds } })
      .select('title parts._id parts.title parts.ordinal')
      .lean()
      .exec();

    const targetSet = new Set(passageIds);
    for (const test of tests) {
      const tId = extractObjectId(test._id);
      for (const part of test.parts || []) {
        const pId = extractObjectId((part as any)._id);
        if (targetSet.has(pId)) {
          map.set(pId, {
            passageId: pId,
            testId: tId,
            testTitle: test.title,
            passageTitle: part.title,
            partNumber: part.ordinal,
          });
        }
      }
    }
    return map;
  }

  // ─── Teacher: Passage Vocabulary Management ───────────────────────────────

  async listTeacherPassageVocabs(passageId: string) {
    const cleanPassageId = passageId.trim();
    const docs = await this.passageVocabModel
      .find({ passageId: cleanPassageId })
      .sort({ order: 1, createdAt: 1 })
      .exec();
    return {
      passageId: cleanPassageId,
      items: docs.map((d) => this.mapPassageVocab(d)),
    };
  }

  async createTeacherPassageVocab(
    passageId: string,
    dto: CreatePassageVocabItemDto,
    actor: UserDocument,
  ) {
    const cleanPassageId = passageId.trim();
    const cleanWord = dto.word.trim().replace(/\s+/g, ' ');
    const normalizedWord = normalizeWordValue(cleanWord);
    const cleanMeaning = dto.meaningVi.trim();
    if (!cleanWord || !cleanMeaning) {
      throw new BadRequestException('Từ vựng và nghĩa tiếng Việt không được để trống.');
    }

    const existing = await this.passageVocabModel
      .findOne({ passageId: cleanPassageId, normalizedWord })
      .exec();
    if (existing) {
      throw new ConflictException(`Từ "${cleanWord}" đã tồn tại trong danh sách bài đọc này.`);
    }

    const meta = await this.resolvePassageMetadata(cleanPassageId);
    const resolvedTestId =
      dto.testId && Types.ObjectId.isValid(dto.testId)
        ? new Types.ObjectId(dto.testId)
        : meta.testId
          ? new Types.ObjectId(meta.testId)
          : undefined;

    const currentCount = await this.passageVocabModel
      .countDocuments({ passageId: cleanPassageId })
      .exec();

    const created = await this.passageVocabModel.create({
      passageId: cleanPassageId,
      testId: resolvedTestId,
      partNumber: dto.partNumber ?? meta.partNumber,
      word: cleanWord,
      normalizedWord,
      partOfSpeech: dto.partOfSpeech ?? VocabPartOfSpeech.NOUN,
      ipa: dto.ipa?.trim() || undefined,
      meaningVi: cleanMeaning,
      paraphraseNote: dto.paraphraseNote?.trim() || undefined,
      contextSentence: dto.contextSentence?.trim() || undefined,
      order: currentCount,
      createdBy: actor._id,
    });

    return this.mapPassageVocab(created);
  }

  async syncTeacherPassageVocabs(
    passageId: string,
    dto: SyncPassageVocabDto,
    actor: UserDocument,
  ) {
    const cleanPassageId = passageId.trim();
    const meta = await this.resolvePassageMetadata(cleanPassageId);
    const resolvedTestId =
      dto.testId && Types.ObjectId.isValid(dto.testId)
        ? new Types.ObjectId(dto.testId)
        : meta.testId
          ? new Types.ObjectId(meta.testId)
          : undefined;
    const partNumber = dto.partNumber ?? meta.partNumber;

    const seen = new Set<string>();
    const payloads: Record<string, any>[] = [];

    for (let idx = 0; idx < (dto.items || []).length; idx++) {
      const rawItem = dto.items[idx]!;
      const cleanWord = rawItem.word.trim().replace(/\s+/g, ' ');
      const normalized = normalizeWordValue(cleanWord);
      const cleanMeaning = rawItem.meaningVi.trim();
      if (!cleanWord || !cleanMeaning || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      payloads.push({
        passageId: cleanPassageId,
        testId: resolvedTestId,
        partNumber,
        word: cleanWord,
        normalizedWord: normalized,
        partOfSpeech: rawItem.partOfSpeech ?? VocabPartOfSpeech.NOUN,
        ipa: rawItem.ipa?.trim() || undefined,
        meaningVi: cleanMeaning,
        paraphraseNote: rawItem.paraphraseNote?.trim() || undefined,
        contextSentence: rawItem.contextSentence?.trim() || undefined,
        order: payloads.length,
        createdBy: actor._id,
      });
    }

    await this.passageVocabModel.deleteMany({ passageId: cleanPassageId }).exec();
    const inserted =
      payloads.length > 0 ? await this.passageVocabModel.insertMany(payloads) : [];

    return {
      passageId: cleanPassageId,
      items: inserted.map((d) => this.mapPassageVocab(d)),
    };
  }

  async updateTeacherPassageVocab(
    passageId: string,
    vocabId: string,
    dto: UpdatePassageVocabItemDto,
  ) {
    if (!Types.ObjectId.isValid(vocabId)) {
      throw new NotFoundException('Không tìm thấy từ vựng bài đọc.');
    }

    const doc = await this.passageVocabModel
      .findOne({ _id: new Types.ObjectId(vocabId), passageId: passageId.trim() })
      .exec();
    if (!doc) {
      throw new NotFoundException('Không tìm thấy từ vựng bài đọc.');
    }

    if (dto.word !== undefined) {
      const cleanWord = dto.word.trim().replace(/\s+/g, ' ');
      if (!cleanWord) {
        throw new BadRequestException('Từ vựng không được để trống.');
      }
      const nextNormalized = normalizeWordValue(cleanWord);
      if (nextNormalized !== doc.normalizedWord) {
        const dup = await this.passageVocabModel
          .findOne({
            passageId: doc.passageId,
            normalizedWord: nextNormalized,
            _id: { $ne: doc._id },
          })
          .exec();
        if (dup) {
          throw new ConflictException(`Từ "${cleanWord}" đã tồn tại trong bài đọc này.`);
        }
      }
      doc.word = cleanWord;
      doc.normalizedWord = nextNormalized;
    }

    if (dto.partOfSpeech !== undefined) doc.partOfSpeech = dto.partOfSpeech;
    if (dto.ipa !== undefined) doc.ipa = dto.ipa.trim() || undefined;
    if (dto.meaningVi !== undefined) {
      const cleanMeaning = dto.meaningVi.trim();
      if (!cleanMeaning) {
        throw new BadRequestException('Nghĩa tiếng Việt không được để trống.');
      }
      doc.meaningVi = cleanMeaning;
    }
    if (dto.paraphraseNote !== undefined) doc.paraphraseNote = dto.paraphraseNote.trim() || undefined;
    if (dto.contextSentence !== undefined) {
      doc.contextSentence = dto.contextSentence.trim() || undefined;
    }

    const saved = await doc.save();
    return this.mapPassageVocab(saved);
  }

  async deleteTeacherPassageVocab(passageId: string, vocabId: string) {
    if (!Types.ObjectId.isValid(vocabId)) {
      throw new NotFoundException('Không tìm thấy từ vựng bài đọc.');
    }
    const deleted = await this.passageVocabModel
      .findOneAndDelete({
        _id: new Types.ObjectId(vocabId),
        passageId: passageId.trim(),
      })
      .exec();
    if (!deleted) {
      throw new NotFoundException('Không tìm thấy từ vựng bài đọc.');
    }
    return { ok: true, id: vocabId };
  }

  // ─── Student: Passage Recommended Vocab & Personal Notebook ───────────────

  async getStudentPassageVocabs(passageId: string) {
    const cleanPassageId = passageId.trim();
    const [docs, meta] = await Promise.all([
      this.passageVocabModel
        .find({ passageId: cleanPassageId })
        .sort({ order: 1, createdAt: 1 })
        .exec(),
      this.resolvePassageMetadata(cleanPassageId),
    ]);

    return {
      passageId: cleanPassageId,
      testId: meta.testId,
      testTitle: meta.testTitle,
      passageTitle: meta.passageTitle,
      partNumber: meta.partNumber,
      items: docs.map((d) => this.mapPassageVocab(d)),
    };
  }

  async listStudentNotebook(actor: UserDocument, query: UserVocabQueryDto) {
    const page = Math.max(1, Number(query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(query.limit) || 20));

    const baseFilter: Record<string, any> = { userId: actor._id };
    const filter: Record<string, any> = { ...baseFilter };

    if (query.status) {
      filter.status = query.status;
    }
    if (query.passageId && query.passageId.trim()) {
      filter.passageId = query.passageId.trim();
    }
    if (query.search && query.search.trim()) {
      const regex = new RegExp(escapeRegex(query.search.trim()), 'i');
      filter.$or = [
        { word: regex },
        { meaningVi: regex },
        { contextSentence: regex },
        { personalNote: regex },
        { paraphraseNote: regex },
      ];
    }

    const [docs, total, allUserEntries] = await Promise.all([
      this.notebookModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .exec(),
      this.notebookModel.countDocuments(filter).exec(),
      this.notebookModel
        .find(baseFilter)
        .select('passageId testId sourcePassageTitle sourceTestTitle status')
        .lean()
        .exec(),
    ]);

    const allPassageIds = Array.from(
      new Set(
        allUserEntries
          .map((e: any) => e.passageId)
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0),
      ),
    );
    const metaMap = await this.resolveManyPassageMetadata(allPassageIds);

    let learningCount = 0;
    let masteredCount = 0;
    const sourceCounter = new Map<
      string,
      {
        passageId: string;
        passageTitle: string;
        testId?: string;
        testTitle?: string;
        count: number;
      }
    >();

    for (const entry of allUserEntries as any[]) {
      if (entry.status === VocabReviewStatus.MASTERED) {
        masteredCount++;
      } else {
        learningCount++;
      }

      if (entry.passageId) {
        const meta = metaMap.get(entry.passageId);
        const existing = sourceCounter.get(entry.passageId);
        if (existing) {
          existing.count++;
        } else {
          sourceCounter.set(entry.passageId, {
            passageId: entry.passageId,
            passageTitle:
              entry.sourcePassageTitle || meta?.passageTitle || 'Bài đọc IELTS Reading',
            testId: entry.testId ? extractObjectId(entry.testId) : meta?.testId,
            testTitle: entry.sourceTestTitle || meta?.testTitle,
            count: 1,
          });
        }
      }
    }

    return {
      items: docs.map((d) => this.mapNotebookItem(d, metaMap)),
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
      stats: {
        total: allUserEntries.length,
        learningCount,
        masteredCount,
      },
      sources: Array.from(sourceCounter.values()),
    };
  }

  async createStudentNotebookEntry(actor: UserDocument, dto: CreateUserVocabDto) {
    const cleanWord = dto.word.trim().replace(/\s+/g, ' ');
    const cleanMeaning = dto.meaningVi.trim();
    if (!cleanWord || !cleanMeaning) {
      throw new BadRequestException('Từ vựng và nghĩa tiếng Việt không được để trống.');
    }

    const normalizedWord = normalizeWordValue(cleanWord);
    const cleanPassageId = dto.passageId?.trim() || undefined;

    const dupFilter: Record<string, any> = {
      userId: actor._id,
      normalizedWord,
      ...(cleanPassageId ? { passageId: cleanPassageId } : { passageId: { $exists: false } }),
    };

    const existing = await this.notebookModel.findOne(dupFilter).exec();
    if (existing) {
      throw new ConflictException(
        cleanPassageId
          ? `Từ "${cleanWord}" đã được lưu trong bài đọc này.`
          : `Từ "${cleanWord}" đã có trong sổ tay từ vựng của bạn.`,
      );
    }

    const meta = cleanPassageId ? await this.resolvePassageMetadata(cleanPassageId) : undefined;
    const resolvedTestId =
      dto.testId && Types.ObjectId.isValid(dto.testId)
        ? new Types.ObjectId(dto.testId)
        : meta?.testId && Types.ObjectId.isValid(meta.testId)
          ? new Types.ObjectId(meta.testId)
          : undefined;

    const created = await this.notebookModel.create({
      userId: actor._id,
      ...(cleanPassageId ? { passageId: cleanPassageId } : {}),
      testId: resolvedTestId,
      sourcePassageTitle: dto.sourcePassageTitle?.trim() || meta?.passageTitle || undefined,
      sourceTestTitle: dto.sourceTestTitle?.trim() || meta?.testTitle || undefined,
      sourcePassageVocabId:
        dto.sourcePassageVocabId && Types.ObjectId.isValid(dto.sourcePassageVocabId)
          ? new Types.ObjectId(dto.sourcePassageVocabId)
          : undefined,
      word: cleanWord,
      normalizedWord,
      partOfSpeech: dto.partOfSpeech ?? VocabPartOfSpeech.NOUN,
      ipa: dto.ipa?.trim() || undefined,
      meaningVi: cleanMeaning,
      contextSentence: dto.contextSentence?.trim() || undefined,
      personalNote: dto.personalNote?.trim() || undefined,
      paraphraseNote: dto.paraphraseNote?.trim() || undefined,
      status: dto.status ?? VocabReviewStatus.LEARNING,
    });

    return this.mapNotebookItem(created);
  }

  async bulkSaveFromPassage(actor: UserDocument, dto: BulkSaveUserVocabDto) {
    const cleanPassageId = dto.passageId.trim();
    if (!cleanPassageId) {
      throw new BadRequestException('Thiếu mã bài đọc (passageId).');
    }

    const [teacherVocabs, meta, existingDocs] = await Promise.all([
      this.passageVocabModel
        .find({ passageId: cleanPassageId })
        .sort({ order: 1, createdAt: 1 })
        .exec(),
      this.resolvePassageMetadata(cleanPassageId),
      this.notebookModel
        .find({ userId: actor._id, passageId: cleanPassageId })
        .select('normalizedWord')
        .lean()
        .exec(),
    ]);

    const sourceList: Array<{
      id?: Types.ObjectId;
      word: string;
      partOfSpeech?: VocabPartOfSpeech;
      ipa?: string;
      meaningVi: string;
      paraphraseNote?: string;
      contextSentence?: string;
      testId?: Types.ObjectId;
    }> =
      teacherVocabs.length > 0
        ? teacherVocabs.map((v) => ({
            id: v._id as Types.ObjectId,
            word: v.word,
            partOfSpeech: v.partOfSpeech,
            ipa: v.ipa,
            meaningVi: v.meaningVi,
            paraphraseNote: v.paraphraseNote,
            contextSentence: v.contextSentence,
            testId: v.testId,
          }))
        : (dto.items || []).map((v) => ({
            word: v.word,
            partOfSpeech: v.partOfSpeech,
            ipa: v.ipa,
            meaningVi: v.meaningVi,
            paraphraseNote: v.paraphraseNote,
            contextSentence: v.contextSentence,
          }));

    const existingWords = new Set(existingDocs.map((d: any) => String(d.normalizedWord || '')));
    const resolvedTestId =
      dto.testId && Types.ObjectId.isValid(dto.testId)
        ? new Types.ObjectId(dto.testId)
        : meta.testId && Types.ObjectId.isValid(meta.testId)
          ? new Types.ObjectId(meta.testId)
          : undefined;

    const toInsert: Record<string, any>[] = [];
    let skippedCount = 0;

    for (const item of sourceList) {
      const cleanWord = item.word.trim().replace(/\s+/g, ' ');
      const normalizedWord = normalizeWordValue(cleanWord);
      const cleanMeaning = item.meaningVi.trim();
      if (!cleanWord || !cleanMeaning) continue;

      if (existingWords.has(normalizedWord)) {
        skippedCount++;
        continue;
      }

      existingWords.add(normalizedWord);
      toInsert.push({
        userId: actor._id,
        passageId: cleanPassageId,
        testId: item.testId ?? resolvedTestId,
        sourcePassageTitle: dto.sourcePassageTitle?.trim() || meta.passageTitle || undefined,
        sourceTestTitle: dto.sourceTestTitle?.trim() || meta.testTitle || undefined,
        sourcePassageVocabId: item.id,
        word: cleanWord,
        normalizedWord,
        partOfSpeech: item.partOfSpeech ?? VocabPartOfSpeech.NOUN,
        ipa: item.ipa?.trim() || undefined,
        meaningVi: cleanMeaning,
        paraphraseNote: item.paraphraseNote?.trim() || undefined,
        contextSentence: item.contextSentence?.trim() || undefined,
        status: VocabReviewStatus.LEARNING,
      });
    }

    const inserted = toInsert.length > 0 ? await this.notebookModel.insertMany(toInsert) : [];
    return {
      savedCount: inserted.length,
      skippedCount,
      items: inserted.map((d) => this.mapNotebookItem(d)),
    };
  }

  async updateStudentNotebookEntry(
    entryId: string,
    actor: UserDocument,
    dto: UpdateUserVocabDto,
  ) {
    if (!Types.ObjectId.isValid(entryId)) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }

    const doc = await this.notebookModel.findById(entryId).exec();
    if (!doc) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }
    if (extractObjectId(doc.userId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('Bạn không có quyền chỉnh sửa từ vựng này.');
    }

    if (dto.word !== undefined) {
      const cleanWord = dto.word.trim().replace(/\s+/g, ' ');
      if (!cleanWord) {
        throw new BadRequestException('Từ vựng không được để trống.');
      }
      const nextNormalized = normalizeWordValue(cleanWord);
      if (nextNormalized !== doc.normalizedWord) {
        const dupFilter: Record<string, any> = {
          userId: actor._id,
          normalizedWord: nextNormalized,
          _id: { $ne: doc._id },
          ...(doc.passageId ? { passageId: doc.passageId } : { passageId: { $exists: false } }),
        };
        const dup = await this.notebookModel.findOne(dupFilter).exec();
        if (dup) {
          throw new ConflictException(`Từ "${cleanWord}" đã tồn tại trong bài đọc này.`);
        }
      }
      doc.word = cleanWord;
      doc.normalizedWord = nextNormalized;
    }

    if (dto.partOfSpeech !== undefined) doc.partOfSpeech = dto.partOfSpeech;
    if (dto.ipa !== undefined) doc.ipa = dto.ipa.trim() || undefined;
    if (dto.meaningVi !== undefined) {
      const cleanMeaning = dto.meaningVi.trim();
      if (!cleanMeaning) {
        throw new BadRequestException('Nghĩa tiếng Việt không được để trống.');
      }
      doc.meaningVi = cleanMeaning;
    }
    if (dto.contextSentence !== undefined) {
      doc.contextSentence = dto.contextSentence.trim() || undefined;
    }
    if (dto.personalNote !== undefined) {
      doc.personalNote = dto.personalNote.trim() || undefined;
    }
    if (dto.paraphraseNote !== undefined) {
      doc.paraphraseNote = dto.paraphraseNote.trim() || undefined;
    }
    if (dto.status !== undefined) doc.status = dto.status;

    const saved = await doc.save();
    return this.mapNotebookItem(saved);
  }

  async updateStudentNotebookStatus(
    entryId: string,
    actor: UserDocument,
    dto: UpdateUserVocabStatusDto,
  ) {
    if (!Types.ObjectId.isValid(entryId)) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }

    const doc = await this.notebookModel.findById(entryId).exec();
    if (!doc) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }
    if (extractObjectId(doc.userId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('Bạn không có quyền cập nhật từ vựng này.');
    }

    doc.status = dto.status;
    const saved = await doc.save();
    return this.mapNotebookItem(saved);
  }

  async deleteStudentNotebookEntry(entryId: string, actor: UserDocument) {
    if (!Types.ObjectId.isValid(entryId)) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }

    const doc = await this.notebookModel.findById(entryId).exec();
    if (!doc) {
      throw new NotFoundException('Không tìm thấy mục từ vựng.');
    }
    if (extractObjectId(doc.userId) !== extractObjectId(actor._id)) {
      throw new ForbiddenException('Bạn không có quyền xóa từ vựng này.');
    }

    await doc.deleteOne();
    return { ok: true, id: entryId };
  }
}
