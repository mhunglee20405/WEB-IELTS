import { apiRequest, buildQueryString } from "../client";
import type {
  CreateExerciseRequest,
  ExerciseAuthoringDetail,
  PaginatedResponse,
  UpdateExerciseRequest,
} from "../types";

export interface ListExercisesQuery {
  page?: number;
  limit?: number;
  type?: string;
  status?: string;
  search?: string;
}

export const exercisesApi = {
  list(query: ListExercisesQuery = {}): Promise<PaginatedResponse<ExerciseAuthoringDetail>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<ExerciseAuthoringDetail>>({
      method: "GET",
      path: `/exercises${qs}`,
    });
  },

  create(payload: CreateExerciseRequest): Promise<ExerciseAuthoringDetail> {
    return apiRequest<ExerciseAuthoringDetail, CreateExerciseRequest>({
      method: "POST",
      path: "/exercises",
      body: payload,
    });
  },

  getById(id: string): Promise<ExerciseAuthoringDetail> {
    return apiRequest<ExerciseAuthoringDetail>({
      method: "GET",
      path: `/exercises/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateExerciseRequest): Promise<ExerciseAuthoringDetail> {
    return apiRequest<ExerciseAuthoringDetail, UpdateExerciseRequest>({
      method: "PATCH",
      path: `/exercises/${encodeURIComponent(id)}`,
      body: payload,
    });
  },

  publish(id: string): Promise<ExerciseAuthoringDetail> {
    return apiRequest<ExerciseAuthoringDetail>({
      method: "POST",
      path: `/exercises/${encodeURIComponent(id)}/publish`,
    });
  },

  createVersion(id: string): Promise<ExerciseAuthoringDetail> {
    return apiRequest<ExerciseAuthoringDetail>({
      method: "POST",
      path: `/exercises/${encodeURIComponent(id)}/versions`,
    });
  },
};

