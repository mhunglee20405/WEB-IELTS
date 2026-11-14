import { ExamTestDocument, ExamPart, QuestionGroup } from 'src/database/schemas/exam-test.schema';
import { Types } from 'mongoose';

export function extractObjectId(ref: unknown): string {
  if (ref instanceof Types.ObjectId) {
    return ref.toHexString();
  }
  if (ref && typeof ref === 'object' && '_id' in ref) {
    const id = (ref as { _id: unknown })._id;
    return id instanceof Types.ObjectId ? id.toHexString() : String(id);
  }
  return String(ref);
}

export class ExamTestMapper {
  static toStudentSafeTest(test: ExamTestDocument) {
    const raw = typeof test.toObject === 'function' ? test.toObject() : test;
    
    let totalQuestions = 0;
    const partsSummary = (raw.parts || []).map((p: any) => {
      let partQCount = 0;
      (p.questionGroups || []).forEach((g: any) => {
        partQCount += (g.questions || []).length;
      });
      totalQuestions += partQCount;

      return {
        id: extractObjectId(p._id),
        type: p.type,
        ordinal: p.ordinal,
        title: p.title,
        questionCount: partQCount,
        durationSeconds: p.durationSeconds || null,
      };
    });

    return {
      id: extractObjectId(raw._id),
      skill: raw.skill,
      title: raw.title,
      description: raw.description,
      version: raw.version,
      status: raw.status,
      allowedModes: raw.allowedModes,
      passScore: raw.passScore,
      fullDurationSeconds: raw.fullDurationSeconds || null,
      totalQuestions,
      parts: partsSummary,
      translationEnabled: raw.translationEnabled,
      access: {
        canPractice: raw.status === 'PUBLISHED',
        reason: raw.status === 'PUBLISHED' ? null : 'Exam is not published yet',
      },
    };
  }

  static toStudentSafePart(part: any) {
    const questionGroups = (part.questionGroups || []).map((g: any) => ({
      id: extractObjectId(g._id),
      type: g.type,
      title: g.title,
      instruction: g.instruction,
      order: g.order,
      sharedOptions: g.sharedOptions,
      maxWords: g.maxWords,
      questionIds: (g.questions || []).map((q: any) => q.number.toString()),
      questions: (g.questions || []).map((q: any) => ({
        id: q.number.toString(),
        number: q.number,
        prompt: q.prompt,
        type: q.type,
        points: q.points,
        options: q.options,
        // Zero Leakage: NEVER leak grading, acceptedKeys, etc.
      })),
    }));

    return {
      id: extractObjectId(part._id),
      title: part.title,
      ordinal: part.ordinal,
      type: part.type,
      contentHtml: part.contentHtml || null,
      audio: part.audioAssetId ? { assetId: extractObjectId(part.audioAssetId) } : null,
      questionGroups,
    };
  }

  static toTeacherDetailedTest(test: ExamTestDocument) {
    const raw = typeof test.toObject === 'function' ? test.toObject() : test;
    
    let totalQuestions = 0;
    const parts = (raw.parts || []).map((p: any) => {
      let partQCount = 0;
      const questionGroups = (p.questionGroups || []).map((g: any) => {
        partQCount += (g.questions || []).length;
        return {
          id: extractObjectId(g._id),
          type: g.type,
          title: g.title,
          instruction: g.instruction,
          order: g.order,
          sharedOptions: g.sharedOptions,
          maxWords: g.maxWords,
          questions: (g.questions || []).map((q: any) => ({
            number: q.number,
            prompt: q.prompt,
            type: q.type,
            points: q.points,
            options: q.options,
            grading: q.grading,
          })),
        };
      });

      totalQuestions += partQCount;

      return {
        id: extractObjectId(p._id),
        type: p.type,
        ordinal: p.ordinal,
        title: p.title,
        contentHtml: p.contentHtml,
        audioAssetId: p.audioAssetId ? extractObjectId(p.audioAssetId) : undefined,
        durationSeconds: p.durationSeconds,
        questionGroups,
      };
    });

    return {
      id: extractObjectId(raw._id),
      title: raw.title,
      skill: raw.skill,
      description: raw.description,
      examPreset: raw.examPreset,
      allowedModes: raw.allowedModes,
      passScore: raw.passScore,
      fullDurationSeconds: raw.fullDurationSeconds,
      translationEnabled: raw.translationEnabled,
      status: raw.status,
      version: raw.version,
      totalQuestions,
      parts,
      createdBy: extractObjectId(raw.createdBy),
      publishedAt: raw.publishedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

