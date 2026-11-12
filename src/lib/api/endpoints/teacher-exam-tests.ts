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
    return apiRequest<ExamTestDetailAuthoring, CreateTeacherExamTestRequest>({
      method: "POST",
      path: "/teacher/exam-tests",
      body: payload,
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
    return apiRequest<ExamTestDetailAuthoring, UpdateTeacherExamTestRequest>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}`,
      body: payload,
    });
  },

  createPart(testId: string, payload: UpsertExamPartInput): Promise<ExamPartAuthoring> {
    return apiRequest<ExamPartAuthoring, UpsertExamPartInput>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts`,
      body: payload,
    });
  },

  updatePart(
    testId: string,
    partId: string,
    payload: Partial<UpsertExamPartInput>,
  ): Promise<ExamPartAuthoring> {
    return apiRequest<ExamPartAuthoring, Partial<UpsertExamPartInput>>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}`,
      body: payload,
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
    return apiRequest<ExamQuestionGroupAuthoring, UpsertExamQuestionGroupInput>({
      method: "POST",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/parts/${encodeURIComponent(partId)}/question-groups`,
      body: payload,
    });
  },

  updateQuestionGroup(
    testId: string,
    groupId: string,
    payload: Partial<UpsertExamQuestionGroupInput>,
  ): Promise<ExamQuestionGroupAuthoring> {
    return apiRequest<ExamQuestionGroupAuthoring, Partial<UpsertExamQuestionGroupInput>>({
      method: "PATCH",
      path: `/teacher/exam-tests/${encodeURIComponent(testId)}/question-groups/${encodeURIComponent(groupId)}`,
      body: payload,
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

