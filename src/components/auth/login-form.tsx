"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, BookOpen, CheckCircle2, Eye, EyeOff, KeyRound, LogIn } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { authApi } from "@/lib/api/endpoints";
import {
  ForgotPasswordFormSchema,
  LoginFormSchema,
  ResetPasswordFormSchema,
} from "@/lib/api/schemas";
import { getDefaultHomeForUser, sanitizeNextPath } from "@/lib/auth/roles";
import { isMockApiMode } from "@/lib/env";
import { useAuth } from "./auth-provider";

type LoginValues = z.infer<typeof LoginFormSchema>;
type ForgotValues = z.infer<typeof ForgotPasswordFormSchema>;
type ResetValues = z.infer<typeof ResetPasswordFormSchema>;

type AuthViewMode = "login" | "forgot" | "reset";

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const { status, user, login } = useAuth();

  const [mode, setMode] = useState<AuthViewMode>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [serverError, setServerError] = useState<{
    message: string;
    requestId?: string;
  } | null>(null);
  const [infoMessage, setInfoMessage] = useState<string | null>(null);

  const loginTitleId = useId();
  const forgotTitleId = useId();
  const resetTitleId = useId();
  const toggleWarningId = useId();

  useEffect(() => {
    if (status === "authenticated" && user) {
      const safeNext = sanitizeNextPath(nextParam, user.roles);
      router.replace(safeNext ?? getDefaultHomeForUser(user.roles));
    }
  }, [status, user, nextParam, router]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(LoginFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "", password: "" },
  });

  const forgotForm = useForm<ForgotValues>({
    resolver: zodResolver(ForgotPasswordFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { email: "" },
  });

  const resetForm = useForm<ResetValues>({
    resolver: zodResolver(ResetPasswordFormSchema),
    mode: "onBlur",
    reValidateMode: "onChange",
    defaultValues: { token: "", newPassword: "" },
  });

  const switchMode = (nextMode: AuthViewMode) => {
    setServerError(null);
    setInfoMessage(null);
    setMode(nextMode);
  };

  const handleLoginSubmit = async (values: LoginValues) => {
    setServerError(null);
    setInfoMessage(null);
    try {
      const signedInUser = await login(values);
      const safeNext = sanitizeNextPath(nextParam, signedInUser.roles);
      router.replace(safeNext ?? getDefaultHomeForUser(signedInUser.roles));
    } catch (error) {
      const apiErr = error instanceof ApiError ? error : null;
      const friendly =
        apiErr?.statusCode === 401
          ? "Email hoặc mật khẩu không đúng. Vui lòng kiểm tra lại."
          : getFriendlyErrorMessage(error);
      setServerError({
        message: friendly,
        requestId: apiErr?.requestId,
      });
    }
  };

  const handleForgotSubmit = async (values: ForgotValues) => {
    setServerError(null);
    setInfoMessage(null);
    try {
      await authApi.forgotPassword(values);
      setInfoMessage(
        "Nếu email tồn tại trong hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi.",
      );
    } catch (error) {
      const apiErr = error instanceof ApiError ? error : null;
      setServerError({
        message: getFriendlyErrorMessage(error),
        requestId: apiErr?.requestId,
      });
    }
  };

  const handleResetSubmit = async (values: ResetValues) => {
    setServerError(null);
    setInfoMessage(null);
    try {
      await authApi.resetPassword(values);
      setInfoMessage("Mật khẩu đã được cập nhật. Bạn có thể đăng nhập bằng mật khẩu mới.");
      setMode("login");
    } catch (error) {
      const apiErr = error instanceof ApiError ? error : null;
      setServerError({
        message: getFriendlyErrorMessage(error),
        requestId: apiErr?.requestId,
      });
    }
  };

  const emailError = loginForm.formState.errors.email;
  const passwordError = loginForm.formState.errors.password;
  const forgotEmailError = forgotForm.formState.errors.email;
  const resetTokenError = resetForm.formState.errors.token;
  const resetPasswordError = resetForm.formState.errors.newPassword;

  return (
    <div className="flex w-full flex-1 flex-col items-center">
      <div className="my-auto w-full max-w-md">
        <div className="lms-auth-card rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-blue-500/5 sm:p-8">
        <div className="mb-6 flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-700 text-white">
            <BookOpen className="h-6 w-6" aria-hidden={true} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-blue-800">
              IELTS Academic LMS
            </p>
            <h1
              id={
                mode === "login"
                  ? loginTitleId
                  : mode === "forgot"
                    ? forgotTitleId
                    : resetTitleId
              }
              className="text-xl font-bold text-slate-950"
            >
              {mode === "login"
                ? "Đăng nhập hệ thống"
                : mode === "forgot"
                  ? "Khôi phục mật khẩu"
                  : "Đặt lại mật khẩu mới"}
            </h1>
          </div>
        </div>

        {serverError ? (
          <div
            role="alert"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-red-300 bg-red-50 p-3.5 text-sm text-red-950"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden={true} />
            <div className="space-y-0.5">
              <p className="font-medium">{serverError.message}</p>
              {serverError.requestId ? (
                <p className="text-xs font-mono text-red-800">
                  Mã tra cứu: {serverError.requestId}
                </p>
              ) : null}
            </div>
          </div>
        ) : null}

        {infoMessage ? (
          <div
            role="status"
            className="mb-5 flex items-start gap-2.5 rounded-lg border border-emerald-300 bg-emerald-50 p-3.5 text-sm text-emerald-950"
          >
            <CheckCircle2
              className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700"
              aria-hidden={true}
            />
            <p className="font-medium">{infoMessage}</p>
          </div>
        ) : null}

        {mode === "login" ? (
          <form
            method="post"
            aria-labelledby={loginTitleId}
            noValidate
            onSubmit={loginForm.handleSubmit(handleLoginSubmit)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-slate-900">
                Email đăng nhập <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <span id="email-hint" className="text-xs text-slate-600">
                Định dạng: ten@domain.com
              </span>
              <input
                id="email"
                type="email"
                autoComplete="username"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                enterKeyHint="next"
                required
                aria-invalid={emailError ? "true" : "false"}
                aria-describedby={emailError ? "email-hint email-error" : "email-hint"}
                className="lms-input"
                {...loginForm.register("email")}
              />
              {emailError ? (
                <p id="email-error" className="text-sm font-medium text-red-700">
                  <span aria-hidden="true">Lỗi: </span>
                  {emailError.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor="password" className="text-sm font-semibold text-slate-900">
                  Mật khẩu <span aria-hidden="true" className="text-red-700">*</span>
                </label>
                <button
                  type="button"
                  onClick={() => switchMode("forgot")}
                  className="text-xs font-semibold text-blue-800 hover:underline"
                >
                  Quên mật khẩu?
                </button>
              </div>
              <span id="password-hint" className="text-xs text-slate-600">
                Tối thiểu 6 ký tự (hỗ trợ dán từ trình quản lý mật khẩu).
              </span>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  enterKeyHint="done"
                  required
                  minLength={6}
                  aria-invalid={passwordError ? "true" : "false"}
                  aria-describedby={
                    passwordError ? "password-hint password-error" : "password-hint"
                  }
                  className="lms-input pr-12"
                  {...loginForm.register("password")}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-pressed={showPassword}
                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                  aria-describedby={toggleWarningId}
                  className="absolute inset-y-1 right-1 inline-flex w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden={true} />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden={true} />
                  )}
                </button>
                <span id={toggleWarningId} className="visually-hidden">
                  Lưu ý: bật hiển thị sẽ hiện rõ mật khẩu trên màn hình.
                </span>
              </div>
              {passwordError ? (
                <p id="password-error" className="text-sm font-medium text-red-700">
                  <span aria-hidden="true">Lỗi: </span>
                  {passwordError.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={loginForm.formState.isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <LogIn className="h-4 w-4" aria-hidden={true} />
              <span>
                {loginForm.formState.isSubmitting ? "Đang đăng nhập..." : "Đăng nhập"}
              </span>
            </button>
          </form>
        ) : null}

        {mode === "forgot" ? (
          <form
            method="post"
            aria-labelledby={forgotTitleId}
            noValidate
            onSubmit={forgotForm.handleSubmit(handleForgotSubmit)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="forgot-email" className="text-sm font-semibold text-slate-900">
                Email tài khoản <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <span id="forgot-email-hint" className="text-xs text-slate-600">
                Nhập email đã được quản trị viên cấp để nhận mã khôi phục.
              </span>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                enterKeyHint="done"
                required
                aria-invalid={forgotEmailError ? "true" : "false"}
                aria-describedby={
                  forgotEmailError
                    ? "forgot-email-hint forgot-email-error"
                    : "forgot-email-hint"
                }
                className="lms-input"
                {...forgotForm.register("email")}
              />
              {forgotEmailError ? (
                <p id="forgot-email-error" className="text-sm font-medium text-red-700">
                  <span aria-hidden="true">Lỗi: </span>
                  {forgotEmailError.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={forgotForm.formState.isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              <KeyRound className="h-4 w-4" aria-hidden={true} />
              <span>
                {forgotForm.formState.isSubmitting
                  ? "Đang gửi yêu cầu..."
                  : "Gửi yêu cầu đặt lại mật khẩu"}
              </span>
            </button>

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs">
              <button
                type="button"
                onClick={() => switchMode("reset")}
                className="font-semibold text-blue-800 hover:underline"
              >
                Đã có mã xác thực? Nhập mã ngay
              </button>
              <button
                type="button"
                onClick={() => switchMode("login")}
                className="font-semibold text-slate-700 hover:underline"
              >
                Quay lại đăng nhập
              </button>
            </div>
          </form>
        ) : null}

        {mode === "reset" ? (
          <form
            method="post"
            aria-labelledby={resetTitleId}
            noValidate
            onSubmit={resetForm.handleSubmit(handleResetSubmit)}
            className="space-y-4"
          >
            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-token" className="text-sm font-semibold text-slate-900">
                Mã đặt lại mật khẩu <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <input
                id="reset-token"
                type="text"
                autoComplete="one-time-code"
                spellCheck={false}
                autoCorrect="off"
                autoCapitalize="none"
                enterKeyHint="next"
                required
                aria-invalid={resetTokenError ? "true" : "false"}
                aria-describedby={resetTokenError ? "reset-token-error" : undefined}
                className="lms-input"
                {...resetForm.register("token")}
              />
              {resetTokenError ? (
                <p id="reset-token-error" className="text-sm font-medium text-red-700">
                  {resetTokenError.message}
                </p>
              ) : null}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="reset-password" className="text-sm font-semibold text-slate-900">
                Mật khẩu mới <span aria-hidden="true" className="text-red-700">*</span>
              </label>
              <span id="reset-pw-hint" className="text-xs text-slate-600">
                Tối thiểu 8 ký tự.
              </span>
              <div className="relative">
                <input
                  id="reset-password"
                  type={showResetPassword ? "text" : "password"}
                  autoComplete="new-password"
                  enterKeyHint="done"
                  required
                  minLength={8}
                  aria-invalid={resetPasswordError ? "true" : "false"}
                  aria-describedby={
                    resetPasswordError
                      ? "reset-pw-hint reset-pw-error"
                      : "reset-pw-hint"
                  }
                  className="lms-input pr-12"
                  {...resetForm.register("newPassword")}
                />
                <button
                  type="button"
                  onClick={() => setShowResetPassword((prev) => !prev)}
                  aria-pressed={showResetPassword}
                  aria-label={showResetPassword ? "Ẩn mật khẩu mới" : "Hiện mật khẩu mới"}
                  className="absolute inset-y-1 right-1 inline-flex w-10 items-center justify-center rounded-md text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                >
                  {showResetPassword ? (
                    <EyeOff className="h-4 w-4" aria-hidden={true} />
                  ) : (
                    <Eye className="h-4 w-4" aria-hidden={true} />
                  )}
                </button>
              </div>
              {resetPasswordError ? (
                <p id="reset-pw-error" className="text-sm font-medium text-red-700">
                  {resetPasswordError.message}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={resetForm.formState.isSubmitting}
              className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-blue-700 px-4 py-2.5 text-base font-semibold text-white transition-colors hover:bg-blue-800 disabled:opacity-60"
            >
              {resetForm.formState.isSubmitting ? "Đang cập nhật..." : "Cập nhật mật khẩu"}
            </button>

            <button
              type="button"
              onClick={() => switchMode("login")}
              className="w-full text-center text-xs font-semibold text-slate-700 hover:underline"
            >
              Quay lại đăng nhập
            </button>
          </form>
        ) : null}
        </div>
      </div>

      {isMockApiMode() && mode === "login" ? (
        <aside
          aria-label="Tài khoản thử nghiệm chế độ Mock"
          className="lms-auth-devbar mt-6 w-fit max-w-full rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs text-slate-700 shadow-sm backdrop-blur-md"
        >
          <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-2.5">
            <span className="font-medium text-slate-700">
              Mock API — Chọn nhanh vai trò:
            </span>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {[
                { label: "Học viên", email: "student@ielts.vn" },
                { label: "Giảng viên", email: "teacher@ielts.vn" },
                { label: "Admin + GV", email: "admin@ielts.vn" },
              ].map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => {
                    loginForm.setValue("email", demo.email, { shouldValidate: true });
                    loginForm.setValue("password", "demo1234", { shouldValidate: true });
                  }}
                  className="inline-flex min-h-9 items-center rounded-lg border border-slate-200/90 bg-slate-50/90 px-2.5 py-1 font-medium text-slate-800 transition-colors hover:border-blue-300 hover:bg-blue-50/80 hover:text-blue-900"
                >
                  {demo.label} ({demo.email})
                </button>
              ))}
            </div>
          </div>
        </aside>
      ) : null}
    </div>
  );
}

