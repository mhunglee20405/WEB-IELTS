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

  getById(testId: string): Promise<ExamTestDetailAuthoring> {
    return apiRequest<ExamTestDetailAuthoring>({
      method: "GET",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}`,
    });
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

  validate(testId: string): Promise<ValidateExamTestResponse> {
    return apiRequest<ValidateExamTestResponse>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/validate`,
    });
  },

  async preview(testId: string): Promise<ExamTestDetailStudent> {
    const raw = await apiRequest<ExamTestDetailStudent>({
      method: "GET",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/preview`,
    });
    return ExamTestDetailStudentSchema.parse(raw);
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

