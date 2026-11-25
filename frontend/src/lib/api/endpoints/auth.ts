import { apiRequest } from "../client";
import { AuthUserSchema, LoginResponseSchema } from "../schemas";
import { tokenStore } from "../token-store";
import type {
  AuthTokens,
  AuthUser,
  ChangeEmailRequest,
  ChangePasswordRequest,
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
    const refreshToken = payload?.refreshToken ?? tokenStore.getRefreshToken() ?? undefined;
    return apiRequest<AuthTokens, RefreshTokenRequest | undefined>({
      method: "POST",
      path: "/auth/refresh",
      body: refreshToken ? { refreshToken } : payload,
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

  async changeEmail(payload: ChangeEmailRequest): Promise<{ success: boolean; message: string; user: AuthUser; tokens?: AuthTokens }> {
    const data = await apiRequest<{ success: boolean; message: string; user: AuthUser; tokens?: AuthTokens }, ChangeEmailRequest>({
      method: "PATCH",
      path: "/auth/change-email",
      body: payload,
    });
    if (data.tokens) {
      tokenStore.setTokens(data.tokens);
    }
    return data;
  },

  async changePassword(payload: ChangePasswordRequest): Promise<{ success: boolean; message: string }> {
    return apiRequest<{ success: boolean; message: string }, ChangePasswordRequest>({
      method: "PATCH",
      path: "/auth/change-password",
      body: payload,
    });
  },

  getStudentProfile(): Promise<StudentProfile> {
    return apiRequest<StudentProfile>({
      method: "GET",
      path: "/students/me/profile",
    });
  },

  getTeacherProfile(): Promise<TeacherProfile> {
    return apiRequest<TeacherProfile>({
      method: "GET",
      path: "/teachers/me/profile",
    });
  },
};

