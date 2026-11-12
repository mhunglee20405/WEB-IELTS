import { apiRequest } from "../client";
import { AuthUserSchema, LoginResponseSchema } from "../schemas";
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
    const data = await apiRequest<LoginResponse, LoginRequest>({
      method: "POST",
      path: "/auth/login",
      body: payload,
      skipAuth: true,
    });
    return LoginResponseSchema.parse(data);
  },

  refresh(payload?: RefreshTokenRequest): Promise<AuthTokens> {
    return apiRequest<AuthTokens, RefreshTokenRequest | undefined>({
      method: "POST",
      path: "/auth/refresh",
      body: payload,
      skipAuth: true,
    });
  },

  logout(): Promise<{ ok?: boolean }> {
    return apiRequest<{ ok?: boolean }>({
      method: "POST",
      path: "/auth/logout",
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

