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
      let qMin = Infinity;
      let qMax = -Infinity;
      (p.questionGroups || []).forEach((g: any) => {
        (g.questions || []).forEach((q: any) => {
          partQCount++;
          const num = Number(q.number);
          if (num < qMin) qMin = num;
          if (num > qMax) qMax = num;
        });
      });
      totalQuestions += partQCount;
      if (qMin > qMax) {
        qMin = 1;
        qMax = Math.max(1, partQCount);
      }

      return {
        id: extractObjectId(p._id),
        type: p.type,
        partType: (p.type || 'PASSAGE').toUpperCase(),
        ordinal: p.ordinal,
        partNumber: p.ordinal,
        title: p.title,
        passageTitle: p.title,
        questionCount: partQCount,
        questionNumberRange: { start: qMin, end: qMax },
        durationSeconds: p.durationSeconds || null,
        available: true,
      };
    });

    const duration = raw.fullDurationSeconds || (raw.skill === 'READING' ? 3600 : 1800);

    return {
      id: extractObjectId(raw._id),
      skill: raw.skill,
      title: raw.title,
      description: raw.description,
      version: raw.version,
      status: raw.status,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      passScore: raw.passScore ?? 70,
      fullDurationSeconds: duration,
      totalDurationSeconds: duration,
      partCount: partsSummary.length,
      totalQuestions,
      partCount: partsSummary.length,
      parts: partsSummary,
      tags: raw.tags || [],
      translationEnabled: raw.translationEnabled,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : undefined,
      access: {
        canPractice: raw.status === 'PUBLISHED',
        reason: raw.status === 'PUBLISHED' ? null : 'Exam is not published yet',
      },
    };
  }

  static toStudentSafeFullTest(test: ExamTestDocument) {
    const raw = typeof test.toObject === 'function' ? test.toObject() : test;
    
    let totalQuestions = 0;
    const parts = (raw.parts || []).map((p: any) => {
      const safePart = ExamTestMapper.toStudentSafePart(p);
      totalQuestions += safePart.questionCount;
      return safePart;
    });

    const duration = raw.fullDurationSeconds || (raw.skill === 'READING' ? 3600 : 1800);

    return {
      id: extractObjectId(raw._id),
      skill: raw.skill,
      title: raw.title,
      description: raw.description,
      version: raw.version,
      status: raw.status,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      passScore: raw.passScore ?? 70,
      fullDurationSeconds: duration,
      totalDurationSeconds: duration,
      partCount: parts.length,
      totalQuestions,
      parts,
      tags: raw.tags || [],
      translationEnabled: raw.translationEnabled,
      updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
      publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : undefined,
      access: {
        canPractice: raw.status === 'PUBLISHED',
        reason: raw.status === 'PUBLISHED' ? null : 'Exam is not published yet',
      },
    };
  }

  static toStudentSafePart(part: any) {
    let qMin = Infinity;
    let qMax = -Infinity;
    let totalPartQuestions = 0;

    const questionGroups = (part.questionGroups || []).map((g: any, gIdx: number) => {
      const gQuestions = (g.questions || []).map((q: any) => {
        const qNum = Number(q.number);
        if (qNum < qMin) qMin = qNum;
        if (qNum > qMax) qMax = qNum;
        totalPartQuestions++;
        return {
          id: q.number.toString(),
          groupId: extractObjectId(g._id || `grp-${gIdx}`),
          questionNumber: q.number,
          number: q.number,
          prompt: q.prompt,
          questionType: q.type,
          type: q.type,
          points: q.points,
          options: q.options || [],
          maxSelections: 1,
          maxWords: q.grading?.maxWords || g.maxWords || undefined,
          // Zero Leakage: NEVER leak grading, acceptedKeys, etc.
        };
      });

      return {
        id: extractObjectId(g._id || `grp-${gIdx}`),
        partId: extractObjectId(part._id),
        groupNumber: g.order || gIdx + 1,
        order: g.order || gIdx + 1,
        title: g.title,
        instructionHtml: g.instruction || '',
        instruction: g.instruction || '',
        questionType: g.type,
        type: g.type,
        questionNumberStart: gQuestions.length > 0 ? gQuestions[0].questionNumber : 1,
        questionNumberEnd: gQuestions.length > 0 ? gQuestions[gQuestions.length - 1].questionNumber : 1,
        sharedOptions: g.sharedOptions || [],
        maxWords: g.maxWords,
        questionIds: gQuestions.map((q: any) => q.questionNumber.toString()),
        questions: gQuestions,
      };
    });

    if (qMin > qMax) {
      qMin = 1;
      qMax = Math.max(1, totalPartQuestions);
    }

    return {
      id: extractObjectId(part._id),
      partNumber: part.ordinal,
      ordinal: part.ordinal,
      partType: (part.type || 'PASSAGE').toUpperCase(),
      type: part.type,
      title: part.title,
      passageTitle: part.title,
      passageHtml: part.contentHtml || '',
      contentHtml: part.contentHtml || null,
      audioAsset: part.audioAssetId ? { assetId: extractObjectId(part.audioAssetId) } : undefined,
      audio: part.audioAssetId ? { assetId: extractObjectId(part.audioAssetId) } : null,
      durationSeconds: part.durationSeconds || undefined,
      questionCount: totalPartQuestions,
      questionNumberRange: { start: qMin, end: qMax },
      questionGroups,
    };
  }

  static toTeacherDetailedTest(test: ExamTestDocument) {
    const raw = typeof test.toObject === 'function' ? test.toObject() : test;
    
    let totalQuestions = 0;
    const parts = (raw.parts || []).map((p: any) => {
      let partQCount = 0;
      let qMin = Infinity;
      let qMax = -Infinity;
      const questionGroups = (p.questionGroups || []).map((g: any, gIdx: number) => {
        partQCount += (g.questions || []).length;
        return {
          id: extractObjectId(g._id),
          partId: extractObjectId(p._id),
          type: g.type,
          questionType: g.type,
          title: g.title,
          instruction: g.instruction,
          instructionHtml: g.instruction || '',
          order: g.order || gIdx + 1,
          groupNumber: g.order || gIdx + 1,
          sharedOptions: g.sharedOptions,
          maxWords: g.maxWords,
          questions: (g.questions || []).map((q: any) => {
            const num = Number(q.number);
            if (num < qMin) qMin = num;
            if (num > qMax) qMax = num;
            const acceptedKeys = q.grading?.acceptedKeys || [];
            return {
              id: extractObjectId(q._id || `q-${q.number}`),
              number: q.number,
              questionNumber: q.number,
              prompt: q.prompt,
              type: q.type,
              questionType: q.type,
              points: q.points,
              options: q.options,
              grading: q.grading,
              correctAnswer: acceptedKeys[0] || '',
              acceptedAnswers: acceptedKeys,
            };
          }),
        };
      });

      totalQuestions += partQCount;
      if (qMin > qMax) {
        qMin = 1;
        qMax = Math.max(1, partQCount);
      }

      return {
        id: extractObjectId(p._id),
        type: p.type,
        partType: (p.type || 'PASSAGE').toUpperCase(),
        ordinal: p.ordinal,
        partNumber: p.ordinal,
        title: p.title,
        passageTitle: p.title,
        contentHtml: p.contentHtml,
        passageHtml: p.contentHtml || '',
        audioAssetId: p.audioAssetId ? extractObjectId(p.audioAssetId) : undefined,
        audioAsset: p.audioAssetId ? { assetId: extractObjectId(p.audioAssetId) } : undefined,
        durationSeconds: p.durationSeconds,
        questionCount: partQCount,
        questionNumberRange: { start: qMin, end: qMax },
        questionGroups,
      };
    });

    const duration = raw.fullDurationSeconds || (raw.skill === 'READING' ? 3600 : 1800);

    return {
      id: extractObjectId(raw._id),
      title: raw.title,
      skill: raw.skill,
      description: raw.description,
      examPreset: raw.examPreset,
      allowedModes: raw.allowedModes || ['PART', 'FULL'],
      passScore: raw.passScore ?? 70,
      fullDurationSeconds: duration,
      totalDurationSeconds: duration,
      translationEnabled: raw.translationEnabled,
      status: raw.status,
      version: raw.version,
      partCount: parts.length,
      totalQuestions,
      partCount: parts.length,
      parts,
      tags: raw.tags || [],
      createdBy: extractObjectId(raw.createdBy),
      publishedAt: raw.publishedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }
}

