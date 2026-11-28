import { apiRequest, buildQueryString } from "../client";
import type {
  BulkSaveUserVocabRequest,
  BulkSaveUserVocabResponse,
  CreateUserVocabRequest,
  PassageVocabItem,
  StudentPassageVocabsResponse,
  UpdateUserVocabRequest,
  UpsertPassageVocabInput,
  UserVocabNotebookEntry,
  UserVocabNotebookListResponse,
  VocabReviewStatus,
} from "../types";

export interface ListNotebookQuery {
  search?: string;
  passageId?: string;
  status?: VocabReviewStatus;
  page?: number;
  limit?: number;
}

export const vocabularyApi = {
  // Teacher endpoints
  getTeacherPassageVocabs(
    passageId: string,
  ): Promise<{ passageId: string; items: PassageVocabItem[] }> {
    return apiRequest<{ passageId: string; items: PassageVocabItem[] }>({
      method: "GET",
      path: `/teacher/passages/${encodeURIComponent(passageId)}/vocabs`,
    });
  },

  addTeacherPassageVocab(
    passageId: string,
    payload: UpsertPassageVocabInput,
  ): Promise<PassageVocabItem> {
    return apiRequest<PassageVocabItem, UpsertPassageVocabInput>({
      method: "POST",
      path: `/teacher/passages/${encodeURIComponent(passageId)}/vocabs`,
      body: payload,
    });
  },

  syncTeacherPassageVocabs(
    passageId: string,
    payload: {
      testId?: string;
      partNumber?: number;
      items: UpsertPassageVocabInput[];
    },
  ): Promise<{ passageId: string; items: PassageVocabItem[] }> {
    return apiRequest<
      { passageId: string; items: PassageVocabItem[] },
      { testId?: string; partNumber?: number; items: UpsertPassageVocabInput[] }
    >({
      method: "PUT",
      path: `/teacher/passages/${encodeURIComponent(passageId)}/vocabs/sync`,
      body: payload,
    });
  },

  updateTeacherPassageVocab(
    passageId: string,
    vocabId: string,
    payload: Partial<UpsertPassageVocabInput>,
  ): Promise<PassageVocabItem> {
    return apiRequest<PassageVocabItem, Partial<UpsertPassageVocabInput>>({
      method: "PATCH",
      path: `/teacher/passages/${encodeURIComponent(passageId)}/vocabs/${encodeURIComponent(vocabId)}`,
      body: payload,
    });
  },

  deleteTeacherPassageVocab(
    passageId: string,
    vocabId: string,
  ): Promise<{ ok: boolean; id: string }> {
    return apiRequest<{ ok: boolean; id: string }>({
      method: "DELETE",
      path: `/teacher/passages/${encodeURIComponent(passageId)}/vocabs/${encodeURIComponent(vocabId)}`,
    });
  },

  // Student endpoints
  getPassageVocabs(passageId: string): Promise<StudentPassageVocabsResponse> {
    return apiRequest<StudentPassageVocabsResponse>({
      method: "GET",
      path: `/vocabulary/passages/${encodeURIComponent(passageId)}`,
    });
  },

  listNotebook(query: ListNotebookQuery = {}): Promise<UserVocabNotebookListResponse> {
    const qs = buildQueryString({
      search: query.search?.trim() || undefined,
      passageId: query.passageId || undefined,
      status: query.status || undefined,
      page: query.page,
      limit: query.limit,
    });
    return apiRequest<UserVocabNotebookListResponse>({
      method: "GET",
      path: `/vocabulary/notebook${qs}`,
    });
  },

  createNotebookEntry(payload: CreateUserVocabRequest): Promise<UserVocabNotebookEntry> {
    return apiRequest<UserVocabNotebookEntry, CreateUserVocabRequest>({
      method: "POST",
      path: "/vocabulary/notebook",
      body: payload,
    });
  },

  bulkSaveFromPassage(
    payload: BulkSaveUserVocabRequest,
  ): Promise<BulkSaveUserVocabResponse> {
    return apiRequest<BulkSaveUserVocabResponse, BulkSaveUserVocabRequest>({
      method: "POST",
      path: "/vocabulary/notebook/bulk",
      body: payload,
    });
  },

  updateNotebookEntry(
    entryId: string,
    payload: UpdateUserVocabRequest,
  ): Promise<UserVocabNotebookEntry> {
    return apiRequest<UserVocabNotebookEntry, UpdateUserVocabRequest>({
      method: "PATCH",
      path: `/vocabulary/notebook/${encodeURIComponent(entryId)}`,
      body: payload,
    });
  },

  updateNotebookStatus(
    entryId: string,
    status: VocabReviewStatus,
  ): Promise<UserVocabNotebookEntry> {
    return apiRequest<UserVocabNotebookEntry, { status: VocabReviewStatus }>({
      method: "PATCH",
      path: `/vocabulary/notebook/${encodeURIComponent(entryId)}/status`,
      body: { status },
    });
  },

  deleteNotebookEntry(entryId: string): Promise<{ ok: boolean; id: string }> {
    return apiRequest<{ ok: boolean; id: string }>({
      method: "DELETE",
      path: `/vocabulary/notebook/${encodeURIComponent(entryId)}`,
    });
  },
};
