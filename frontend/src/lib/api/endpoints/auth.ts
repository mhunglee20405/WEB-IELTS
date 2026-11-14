import { isMockApiMode } from "../../env";
import { apiRequest } from "../client";
import { AuthUserSchema, LoginResponseSchema } from "../schemas";
import { tokenStore } from "../token-store";
import type {
  AuthTokens,
  AuthUser,
  ForgotPasswordRequest,
  LoginRequest,
  LoginResponse,
  RefreshTokenRequest,
  ResetPasswordRequest,
  StudentProfile,
  TeacherProfile,
} from "../types";

export const authApi = {
  async login(payload: LoginRequest): Promise<LoginResponse> {
    const data = await apiRequest<Record<string, unknown>, LoginRequest>({
      method: "POST",
      path: "/auth/login",
      body: payload,
      skipAuth: true,
    });

    const parsed = LoginResponseSchema.parse(data);
    if (parsed.user) {
      return { user: parsed.user, tokens: parsed.tokens };
    }

    // Live backend returns { accessToken, refreshToken, expiresIn } only.
    tokenStore.setTokens(parsed.tokens);
    const user = await authApi.me();
    return { user, tokens: parsed.tokens };
  },

  refresh(payload?: RefreshTokenRequest): Promise<AuthTokens> {
    return apiRequest<AuthTokens, RefreshTokenRequest | undefined>({
      method: "POST",
      path: "/auth/refresh",
      body: payload,
      skipAuth: true,
    });
  },

  logout(): Promise<{ ok?: boolean; message?: string }> {
    const refreshToken = tokenStore.getRefreshToken();
    return apiRequest<{ ok?: boolean; message?: string }, { refreshToken?: string } | undefined>({
      method: "POST",
      path: "/auth/logout",
      body: refreshToken ? { refreshToken } : undefined,
    });
  },

  forgotPassword(payload: ForgotPasswordRequest): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }, ForgotPasswordRequest>({
      method: "POST",
      path: "/auth/forgot-password",
      body: payload,
      skipAuth: true,
    });
  },

  resetPassword(payload: ResetPasswordRequest): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }, ResetPasswordRequest>({
      method: "POST",
      path: "/auth/reset-password",
      body: payload,
      skipAuth: true,
    });
  },

  async me(): Promise<AuthUser> {
    const data = await apiRequest<AuthUser>({
      method: "GET",
      path: "/auth/me",
    });
    return AuthUserSchema.parse(data);
  },

  async getStudentProfile(): Promise<StudentProfile> {
    if (isMockApiMode()) {
      return apiRequest<StudentProfile>({
        method: "GET",
        path: "/students/me/profile",
      });
    }

    const user = await authApi.me();
    let quota = { used: 0, limit: 3 };
    try {
      quota = await apiRequest<{ used: number; limit: number }>({
        method: "GET",
        path: "/extension-requests/quota",
      });
    } catch {
      // ignore
    }

    let activePenaltiesCount = 0;
    try {
      const penalties = await apiRequest<{ activePenaltiesCount?: number; totalActive?: number }>({
        method: "GET",
        path: "/penalties/mine",
      });
      activePenaltiesCount = penalties.activePenaltiesCount ?? penalties.totalActive ?? 0;
    } catch {
      // ignore
    }

    return {
      user,
      enrolledCoursesCount: 0,
      activePenaltiesCount,
      extensionsUsedThisMonth: quota.used ?? 0,
      maxExtensionsPerMonth: quota.limit ?? 3,
    };
  },

  async getTeacherProfile(): Promise<TeacherProfile> {
    if (isMockApiMode()) {
      return apiRequest<TeacherProfile>({
        method: "GET",
        path: "/teachers/me/profile",
      });
    }

    const user = await authApi.me();
    let activeCoursesCount = 0;
    try {
      const courses = await apiRequest<{ total?: number; items?: unknown[] }>({
        method: "GET",
        path: "/courses",
      });
      activeCoursesCount = courses.total ?? (courses.items ? courses.items.length : 0);
    } catch {
      // ignore
    }

    return {
      user,
      activeCoursesCount,
      pendingExtensionsCount: 0,
      pendingTranslationsCount: 0,
    };
  },
};

