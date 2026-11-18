import { isMockApiMode } from "../../env";
import { apiRequest, buildQueryString } from "../client";
import { ApiError } from "../error";
import { ExamTestDetailStudentSchema } from "../schemas";
import type {
  ExamSkill,
  ExamTestDetailAuthoring,
  ExamTestDetailStudent,
  ExamTestStatus,
  ExamTestSummary,
  PaginatedResponse,
  CreateTeacherExamTestRequest,
  UpdateTeacherExamTestRequest,
  UpsertExamPartInput,
  UpsertExamQuestionGroupInput,
  ValidateExamTestResponse,
  ExamPartAuthoring,
  ExamQuestionGroupAuthoring,
} from "../types";
import { mediaApi } from "./media";

export interface ListTeacherExamTestsQuery {
  skill?: ExamSkill;
  status?: ExamTestStatus;
  search?: string;
  page?: number;
  limit?: number;
}

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/ogg",
  "audio/webm",
]);

function inferAudioMimeType(file: File): string {
  if (file.type && ALLOWED_AUDIO_MIME_TYPES.has(file.type.toLowerCase())) {
    return file.type.toLowerCase();
  }
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".mp3")) return "audio/mpeg";
  if (lower.endsWith(".wav")) return "audio/wav";
  if (lower.endsWith(".m4a")) return "audio/mp4";
  if (lower.endsWith(".ogg")) return "audio/ogg";
  if (lower.endsWith(".webm")) return "audio/webm";
  return file.type || "application/octet-stream";
}

function uploadFileToSignedUrl(
  uploadUrl: string,
  file: File,
  mimeType: string,
  onProgress?: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", uploadUrl, true);
    xhr.setRequestHeader("Content-Type", mimeType);

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.min(99, Math.round((event.loaded / event.total) * 100)));
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress?.(100);
        resolve();
      } else {
        reject(
          new ApiError({
            statusCode: xhr.status || 500,
            code: "AUDIO_UPLOAD_FAILED",
            message: `Tải tệp âm thanh lên không thành công (HTTP ${xhr.status}).`,
          }),
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new ApiError({
          statusCode: 0,
          code: "AUDIO_UPLOAD_FAILED",
          message: "Lỗi mạng khi tải tệp âm thanh lên bộ nhớ lưu trữ.",
        }),
      );
    };

    xhr.send(file);
  });
}

export function normalizeStudentTestDetail(raw: any): ExamTestDetailStudent {
  if (!raw) return raw;

  const duration =
    raw.totalDurationSeconds ??
    raw.fullDurationSeconds ??
    (raw.skill === "READING" ? 3600 : 1800);

  const parts = (raw.parts || []).map((p: any, pIdx: number) => {
    let qMin = Infinity;
    let qMax = -Infinity;
    let totalQuestions = 0;

    const questionGroups = (p.questionGroups || []).map((g: any, gIdx: number) => {
      const gQuestions = (g.questions || []).map((q: any) => {
        const qNum = Number(q.questionNumber ?? q.number ?? 1);
        if (qNum < qMin) qMin = qNum;
        if (qNum > qMax) qMax = qNum;
        totalQuestions++;
        return {
          id: String(q.id || q.number || `q-${qNum}`),
          groupId: String(q.groupId || g.id || `grp-${gIdx + 1}`),
          questionNumber: qNum,
          prompt: q.prompt || "",
          questionType: q.questionType || q.type || g.questionType || g.type,
          options: (q.options || []).map((o: any) => ({
            key: o.key || o.id || "A",
            text: o.text || "",
          })),
          blankLabel: q.blankLabel,
          maxSelections: q.maxSelections ?? 1,
          maxWords: q.maxWords ?? g.maxWords,
        };
      });

      return {
        id: String(g.id || `grp-${gIdx + 1}`),
        partId: String(p.id || `part-${pIdx + 1}`),
        groupNumber: g.groupNumber ?? g.order ?? gIdx + 1,
        title: g.title,
        instructionHtml: g.instructionHtml ?? g.instruction ?? "",
        questionType: g.questionType ?? g.type,
        questionNumberStart: gQuestions.length > 0 ? gQuestions[0].questionNumber : 1,
        questionNumberEnd:
          gQuestions.length > 0 ? gQuestions[gQuestions.length - 1].questionNumber : 1,
        sharedOptions: g.sharedOptions,
        maxWords: g.maxWords,
        questions: gQuestions,
      };
    });

    if (qMin > qMax) {
      qMin = 1;
      qMax = Math.max(1, totalQuestions);
    }

    return {
      id: String(p.id || `part-${pIdx + 1}`),
      partNumber: p.partNumber ?? p.ordinal ?? pIdx + 1,
      partType: p.partType ?? (p.type || "PASSAGE").toUpperCase(),
      title: p.title || `Part ${pIdx + 1}`,
      instructions: p.instructions,
      passageTitle: p.passageTitle ?? p.title,
      passageHtml: p.passageHtml ?? p.contentHtml ?? "",
      paragraphs: p.paragraphs,
      audioAsset: p.audioAsset ?? (p.audioAssetId ? { assetId: p.audioAssetId } : undefined),
      durationSeconds: p.durationSeconds,
      questionCount: p.questionCount ?? totalQuestions,
      questionNumberRange: p.questionNumberRange ?? { start: qMin, end: qMax },
      questionGroups,
    };
  });

  const normalized = {
    id: String(raw.id),
    title: raw.title || "",
    subtitle: raw.subtitle,
    skill: raw.skill,
    status: raw.status || "DRAFT",
    version: raw.version || 1,
    partCount: raw.partCount ?? parts.length,
    totalQuestions:
      raw.totalQuestions ?? parts.reduce((acc: number, p: any) => acc + (p.questionCount || 0), 0),
    totalDurationSeconds: duration,
    difficulty: raw.difficulty,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    allowedModes:
      Array.isArray(raw.allowedModes) && raw.allowedModes.length > 0
        ? raw.allowedModes
        : ["PART", "FULL"],
    createdBy: raw.createdBy,
    instructions: raw.instructions ?? raw.description,
    parts,
    activeAttempt: raw.activeAttempt ?? null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : undefined,
  };

  return ExamTestDetailStudentSchema.parse(normalized);
}

export function normalizeTeacherTestDetail(raw: any): ExamTestDetailAuthoring {
  if (!raw) return raw;

  const duration =
    raw.totalDurationSeconds ??
    raw.fullDurationSeconds ??
    (raw.skill === "READING" ? 3600 : 1800);

  const parts = (raw.parts || []).map((p: any, pIdx: number) => {
    let qMin = Infinity;
    let qMax = -Infinity;
    let totalQuestions = 0;

    const questionGroups = (p.questionGroups || []).map((g: any, gIdx: number) => {
      const gQuestions = (g.questions || []).map((q: any) => {
        const qNum = Number(q.questionNumber ?? q.number ?? 1);
        if (qNum < qMin) qMin = qNum;
        if (qNum > qMax) qMax = qNum;
        totalQuestions++;
        const accepted =
          q.acceptedAnswers ??
          (Array.isArray(q.grading?.acceptedKeys) ? q.grading.acceptedKeys : undefined);
        const correct =
          q.correctAnswer ??
          (Array.isArray(q.grading?.acceptedKeys) ? q.grading.acceptedKeys[0] : q.grading?.acceptedKeys);

        return {
          id: String(q.id || q.number || `q-${qNum}`),
          questionNumber: qNum,
          prompt: q.prompt || "",
          questionType: q.questionType ?? q.type ?? g.questionType ?? g.type,
          options: (q.options || []).map((o: any) => ({
            key: o.key || o.id || "A",
            text: o.text || "",
          })),
          correctAnswer: correct ?? "",
          acceptedAnswers: accepted,
          maxSelections: q.maxSelections ?? 1,
          maxWords: q.maxWords ?? g.maxWords,
          referenceParagraph: q.referenceParagraph,
          explanation: q.explanation,
        };
      });

      return {
        id: String(g.id || `grp-${gIdx + 1}`),
        groupNumber: g.groupNumber ?? g.order ?? gIdx + 1,
        title: g.title,
        instructionHtml: g.instructionHtml ?? g.instruction ?? "",
        questionType: g.questionType ?? g.type,
        sharedOptions: g.sharedOptions,
        maxWords: g.maxWords,
        maxSelections: g.maxSelections,
        questions: gQuestions,
      };
    });

    if (qMin > qMax) {
      qMin = 1;
      qMax = Math.max(1, totalQuestions);
    }

    return {
      id: String(p.id || `part-${pIdx + 1}`),
      partNumber: p.partNumber ?? p.ordinal ?? pIdx + 1,
      partType: p.partType ?? (p.type || "PASSAGE").toUpperCase(),
      title: p.title || `Part ${pIdx + 1}`,
      instructions: p.instructions,
      passageTitle: p.passageTitle ?? p.title,
      passageHtml: p.passageHtml ?? p.contentHtml ?? "",
      paragraphs: p.paragraphs,
      audioAsset: p.audioAsset ?? (p.audioAssetId ? { assetId: p.audioAssetId } : undefined),
      durationSeconds: p.durationSeconds,
      transcript: p.transcript,
      questionCount: p.questionCount ?? totalQuestions,
      questionNumberRange: p.questionNumberRange ?? { start: qMin, end: qMax },
      questionGroups,
    };
  });

  return {
    id: String(raw.id),
    title: raw.title || "",
    subtitle: raw.subtitle,
    skill: raw.skill,
    status: raw.status || "DRAFT",
    version: raw.version || 1,
    partCount: raw.partCount ?? parts.length,
    totalQuestions:
      raw.totalQuestions ?? parts.reduce((acc: number, p: any) => acc + (p.questionCount || 0), 0),
    totalDurationSeconds: duration,
    difficulty: raw.difficulty,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    allowedModes:
      Array.isArray(raw.allowedModes) && raw.allowedModes.length > 0
        ? raw.allowedModes
        : ["PART", "FULL"],
    createdBy: raw.createdBy,
    instructions: raw.instructions ?? raw.description,
    parts,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : new Date().toISOString(),
    publishedAt: raw.publishedAt ? new Date(raw.publishedAt).toISOString() : undefined,
  };
}

export const teacherExamTestsApi = {
  list(query: ListTeacherExamTestsQuery = {}): Promise<PaginatedResponse<ExamTestSummary>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExamTestSummary>>({
      method: "GET",
      path: `/teacher/exam-tests${qs}`,
    });
  },

  create(payload: CreateTeacherExamTestRequest): Promise<ExamTestDetailAuthoring> {
    const isMock = isMockApiMode();
    const body: Record<string, unknown> = {
      title: payload.title.trim(),
      skill: payload.skill,
      description: payload.description || payload.instructions || payload.subtitle || undefined,
      allowedModes: payload.allowedModes ?? ["PART", "FULL"],
      passScore: payload.passScore ?? 70,
      fullDurationSeconds:
        payload.fullDurationSeconds ??
        payload.totalDurationSeconds ??
        (payload.skill === "READING" ? 3600 : 1800),
      translationEnabled: payload.translationEnabled ?? (payload.skill === "READING"),
    };

    if (isMock) {
      if (payload.subtitle) body.subtitle = payload.subtitle;
      if (payload.difficulty) body.difficulty = payload.difficulty;
      if (payload.tags) body.tags = payload.tags;
      if (payload.totalDurationSeconds) body.totalDurationSeconds = payload.totalDurationSeconds;
      if (payload.instructions) body.instructions = payload.instructions;
    }

    return apiRequest<ExamTestDetailAuthoring, typeof body>({
      method: "POST",
      path: "/teacher/exam-tests",
      body,
    });
  },

  async getById(testId: string): Promise<ExamTestDetailAuthoring> {
    const raw = await apiRequest<ExamTestDetailAuthoring>({
      method: "GET",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}`,
    });
    return normalizeTeacherTestDetail(raw);
  },

  update(
    testId: string,
    payload: UpdateTeacherExamTestRequest,
  ): Promise<ExamTestDetailAuthoring> {
    const isMock = isMockApiMode();
    const body: Record<string, unknown> = {};
    if (payload.title) body.title = payload.title.trim();
    if (payload.description || payload.instructions || payload.subtitle) {
      body.description = payload.description || payload.instructions || payload.subtitle;
    }
    if (payload.allowedModes) body.allowedModes = payload.allowedModes;
    if (payload.passScore !== undefined) body.passScore = payload.passScore;
    if (payload.fullDurationSeconds || payload.totalDurationSeconds) {
      body.fullDurationSeconds = payload.fullDurationSeconds ?? payload.totalDurationSeconds;
    }
    if (payload.translationEnabled !== undefined) {
      body.translationEnabled = payload.translationEnabled;
    }

    if (isMock) {
      if (payload.subtitle) body.subtitle = payload.subtitle;
      if (payload.difficulty) body.difficulty = payload.difficulty;
      if (payload.tags) body.tags = payload.tags;
      if (payload.totalDurationSeconds) body.totalDurationSeconds = payload.totalDurationSeconds;
      if (payload.instructions) body.instructions = payload.instructions;
    }

    return apiRequest<ExamTestDetailAuthoring, typeof body>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}`,
      body,
    });
  },

  async createPart(testId: string, payload: UpsertExamPartInput): Promise<ExamPartAuthoring> {
    if (isMockApiMode()) {
      return apiRequest<ExamPartAuthoring, UpsertExamPartInput>({
        method: "POST",
        path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts`,
        body: payload,
      });
    }

    // Backend CreateExamPartDto: { type, ordinal, title, contentHtml, audioAssetId, durationSeconds }
    const partDto = {
      type: payload.partType || (payload as any).type || "PASSAGE",
      ordinal: payload.partNumber || (payload as any).ordinal || 1,
      title: payload.title.trim(),
      contentHtml: payload.passageHtml || (payload as any).contentHtml || undefined,
      audioAssetId: payload.audioAsset?.assetId || (payload as any).audioAssetId || undefined,
      durationSeconds: payload.durationSeconds,
    };

    const updatedTest = await apiRequest<any>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts`,
      body: partDto,
    });

    const partsList = updatedTest?.parts || [];
    const createdPart =
      partsList[partsList.length - 1] ||
      partsList.find((p: any) => p.ordinal === partDto.ordinal) ||
      updatedTest;

    const partId = createdPart?.id || createdPart?._id;

    if (partId && payload.questionGroups && payload.questionGroups.length > 0) {
      for (let gIdx = 0; gIdx < payload.questionGroups.length; gIdx++) {
        const g = payload.questionGroups[gIdx]!;
        const groupDto = {
          title: g.title || undefined,
          instruction: g.instructionHtml || undefined,
          type: g.questionType,
          order: g.groupNumber || gIdx + 1,
          sharedOptions: g.sharedOptions?.map((o) => ({ key: o.key || (o as any).id || "", text: o.text })),
          maxWords: g.maxWords,
          questions: g.questions.map((q) => {
            const acceptedKeys = Array.isArray(q.correctAnswer)
              ? q.correctAnswer
              : q.acceptedAnswers && q.acceptedAnswers.length > 0
                ? q.acceptedAnswers
                : [String(q.correctAnswer || "")];

            return {
              number: q.questionNumber,
              prompt: q.prompt,
              type: q.questionType || g.questionType,
              points: 1,
              options: q.options?.map((o) => ({ key: o.key || (o as any).id || "", text: o.text })),
              grading: {
                acceptedKeys,
                caseSensitive: (q as any).caseSensitive ?? false,
                maxWords: q.maxWords,
              },
            };
          }),
        };

        await apiRequest({
          method: "POST",
          path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}/question-groups`,
          body: groupDto,
        });
      }
    }

    return createdPart;
  },

  updatePart(
    testId: string,
    partId: string,
    payload: Partial<UpsertExamPartInput>,
  ): Promise<ExamPartAuthoring> {
    if (isMockApiMode()) {
      return apiRequest<ExamPartAuthoring, Partial<UpsertExamPartInput>>({
        method: "PATCH",
        path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}`,
        body: payload,
      });
    }

    const body: Record<string, unknown> = {};
    if (payload.title) body.title = payload.title.trim();
    if (payload.partNumber !== undefined) body.ordinal = payload.partNumber;
    if (payload.passageHtml !== undefined) body.contentHtml = payload.passageHtml;
    if (payload.audioAsset?.assetId) body.audioAssetId = payload.audioAsset.assetId;
    if (payload.durationSeconds !== undefined) body.durationSeconds = payload.durationSeconds;

    return apiRequest<ExamPartAuthoring, typeof body>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}`,
      body,
    });
  },

  deletePart(testId: string, partId: string): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>({
      method: "DELETE",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}`,
    });
  },

  createQuestionGroup(
    testId: string,
    partId: string,
    payload: UpsertExamQuestionGroupInput,
  ): Promise<ExamQuestionGroupAuthoring> {
    if (isMockApiMode()) {
      return apiRequest<ExamQuestionGroupAuthoring, UpsertExamQuestionGroupInput>({
        method: "POST",
        path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}/question-groups`,
        body: payload,
      });
    }

    const body = {
      title: payload.title?.trim() || undefined,
      instruction: payload.instructionHtml || undefined,
      type: payload.questionType,
      order: payload.groupNumber || 1,
      sharedOptions: payload.sharedOptions?.map((o) => ({
        key: o.key || (o as any).id || "",
        text: o.text,
      })),
      maxWords: payload.maxWords,
      questions: payload.questions.map((q) => {
        const acceptedKeys = Array.isArray(q.correctAnswer)
          ? q.correctAnswer
          : q.acceptedAnswers && q.acceptedAnswers.length > 0
            ? q.acceptedAnswers
            : [String(q.correctAnswer || "")];

        return {
          number: q.questionNumber,
          prompt: q.prompt,
          type: q.questionType || payload.questionType,
          points: 1,
          options: q.options?.map((o) => ({ key: o.key || (o as any).id || "", text: o.text })),
          grading: {
            acceptedKeys,
            caseSensitive: (q as any).caseSensitive ?? false,
            maxWords: q.maxWords,
          },
        };
      }),
    };

    return apiRequest<ExamQuestionGroupAuthoring, typeof body>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}/question-groups`,
      body,
    });
  },

  updateQuestionGroup(
    testId: string,
    groupId: string,
    payload: Partial<UpsertExamQuestionGroupInput>,
  ): Promise<ExamQuestionGroupAuthoring> {
    if (isMockApiMode()) {
      return apiRequest<ExamQuestionGroupAuthoring, Partial<UpsertExamQuestionGroupInput>>({
        method: "PATCH",
        path: `/teacher/exam-tests/${encodeURIComponent(testId)}/question-groups/${encodeURIComponent(groupId)}`,
        body: payload,
      });
    }

    const body: Record<string, unknown> = {};
    if (payload.title !== undefined) body.title = payload.title?.trim() || undefined;
    if (payload.instructionHtml !== undefined) body.instruction = payload.instructionHtml;
    if (payload.questionType) body.type = payload.questionType;
    if (payload.groupNumber !== undefined) body.order = payload.groupNumber;
    if (payload.sharedOptions) {
      body.sharedOptions = payload.sharedOptions.map((o) => ({
        key: o.key || (o as any).id || "",
        text: o.text,
      }));
    }
    if (payload.maxWords !== undefined) body.maxWords = payload.maxWords;
    if (payload.questions) {
      body.questions = payload.questions.map((q) => {
        const acceptedKeys = Array.isArray(q.correctAnswer)
          ? q.correctAnswer
          : q.acceptedAnswers && q.acceptedAnswers.length > 0
            ? q.acceptedAnswers
            : [String(q.correctAnswer || "")];

        return {
          number: q.questionNumber,
          prompt: q.prompt,
          type: q.questionType || payload.questionType,
          points: 1,
          options: q.options?.map((o) => ({ key: o.key || (o as any).id || "", text: o.text })),
          grading: {
            acceptedKeys,
            caseSensitive: (q as any).caseSensitive ?? false,
            maxWords: q.maxWords,
          },
        };
      });
    }

    return apiRequest<ExamQuestionGroupAuthoring, typeof body>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/question-groups/${encodeURIComponent(groupId)}`,
      body,
    });
  },

  deleteQuestionGroup(testId: string, groupId: string): Promise<{ ok: boolean }> {
    return apiRequest<{ ok: boolean }>({
      method: "DELETE",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/question-groups/${encodeURIComponent(groupId)}`,
    });
  },

  async validate(testId: string): Promise<ValidateExamTestResponse> {
    const raw = await apiRequest<any>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/validate`,
    });
    const isValid =
      raw?.valid ?? raw?.isValid ?? (Array.isArray(raw?.errors) ? raw.errors.length === 0 : false);
    const errors = (raw?.errors || []).map((err: any) =>
      typeof err === "string" ? { message: err } : err,
    );
    return {
      valid: Boolean(isValid),
      errors,
      warnings: raw?.warnings || [],
    };
  },

  async preview(testId: string): Promise<ExamTestDetailStudent> {
    const raw = await apiRequest<any>({
      method: "GET",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/preview`,
    });
    return normalizeStudentTestDetail(raw);
  },

  publish(testId: string): Promise<ExamTestDetailAuthoring> {
    return apiRequest<ExamTestDetailAuthoring>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/publish`,
    });
  },

  newVersion(testId: string): Promise<ExamTestDetailAuthoring> {
    return apiRequest<ExamTestDetailAuthoring>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/new-version`,
    });
  },

  archive(testId: string): Promise<ExamTestDetailAuthoring> {
    return apiRequest<ExamTestDetailAuthoring>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/archive`,
    });
  },

  delete(testId: string): Promise<{ ok: boolean; message?: string }> {
    return apiRequest<{ ok: boolean; message?: string }>({
      method: "DELETE",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}`,
    });
  },

  async uploadListeningAudio(
    file: File,
    options?: {
      onProgress?: (percent: number) => void;
      durationSeconds?: number;
    },
  ): Promise<{ assetId: string; mimeType: string; filename: string }> {
    const mimeType = inferAudioMimeType(file);
    if (!ALLOWED_AUDIO_MIME_TYPES.has(mimeType)) {
      throw new ApiError({
        statusCode: 400,
        code: "AUDIO_UPLOAD_FAILED",
        message: "Định dạng âm thanh chưa được hỗ trợ. Vui lòng dùng MP3, WAV, M4A, OGG hoặc WebM.",
      });
    }
    if (file.size > 100 * 1024 * 1024) {
      throw new ApiError({
        statusCode: 400,
        code: "AUDIO_UPLOAD_FAILED",
        message: "Dung lượng tệp âm thanh vượt quá giới hạn 100MB.",
      });
    }

    options?.onProgress?.(10);
    const init = await mediaApi.initAudioUpload({
      filename: file.name,
      mimeType,
      sizeBytes: file.size,
    });

    if (isMockApiMode()) {
      options?.onProgress?.(60);
    } else {
      await uploadFileToSignedUrl(init.uploadUrl, file, mimeType, options?.onProgress);
    }

    await mediaApi.completeAudioUpload({
      assetId: init.assetId,
      durationSeconds: options?.durationSeconds,
    });
    options?.onProgress?.(100);

    return {
      assetId: init.assetId,
      mimeType,
      filename: file.name,
    };
  },
};

