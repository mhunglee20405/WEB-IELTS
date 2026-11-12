import { apiRequest, buildQueryString } from "../client";
import type {
  AuthUser,
  CreateUserRequest,
  PaginatedResponse,
  UpdateUserRequest,
} from "../types";

export interface ListUsersQuery {
  page?: number;
  limit?: number;
  role?: string;
  search?: string;
  status?: string;
}

export const usersApi = {
  list(query: ListUsersQuery = {}): Promise<PaginatedResponse<AuthUser>> {
    const qs = buildQueryString({ ...query });
    return apiRequest<PaginatedResponse<AuthUser>>({
      method: "GET",
      path: `/users${qs}`,
    });
  },

  create(payload: CreateUserRequest): Promise<AuthUser> {
    return apiRequest<AuthUser, CreateUserRequest>({
      method: "POST",
      path: "/users",
      body: payload,
    });
  },

  getById(id: string): Promise<AuthUser> {
    return apiRequest<AuthUser>({
      method: "GET",
      path: `/users/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateUserRequest): Promise<AuthUser> {
    return apiRequest<AuthUser, UpdateUserRequest>({
      method: "PATCH",
      path: `/users/${encodeURIComponent(id)}`,
      body: payload,
    });
  },
};

