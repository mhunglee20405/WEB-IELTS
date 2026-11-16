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
    const rawPayload = payload as unknown as Record<string, unknown>;
    const role = (rawPayload.role as string | undefined) || (payload.roles && payload.roles[0]) || "student";
    const body = {
      fullName: payload.fullName,
      email: payload.email,
      password: payload.password,
      role,
      roles: [role],
      timezone: payload.timezone,
    };
    return apiRequest<AuthUser, typeof body>({
      method: "POST",
      path: "/users",
      body,
    });
  },

  getById(id: string): Promise<AuthUser> {
    return apiRequest<AuthUser>({
      method: "GET",
      path: `/users/${encodeURIComponent(id)}`,
    });
  },

  update(id: string, payload: UpdateUserRequest): Promise<AuthUser> {
    const rawPayload = payload as unknown as Record<string, unknown>;
    const role = (rawPayload.role as string | undefined) || (payload.roles && payload.roles[0]);
    const body: Record<string, unknown> = {
      fullName: payload.fullName,
      status: payload.status,
      timezone: payload.timezone,
    };
    if (role) {
      body.role = role;
      body.roles = [role];
    }
    return apiRequest<AuthUser, typeof body>({
      method: "PATCH",
      path: `/users/${encodeURIComponent(id)}`,
      body,
    });
  },
};

