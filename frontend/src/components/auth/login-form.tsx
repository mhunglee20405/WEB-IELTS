"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, BookOpen, Eye, EyeOff, LogIn, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { systemApi } from "@/lib/api/endpoints";
import { LoginFormSchema } from "@/lib/api/schemas";
import { getDefaultHomeForUser, sanitizeNextPath } from "@/lib/auth/roles";
import { isMockApiMode } from "@/lib/env";
import { useAuth } from "./auth-provider";

type LoginValues = z.infer<typeof LoginFormSchema>;

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextParam = searchParams.get("next");
  const { status, user, login } = useAuth();

  const [showPassword, setShowPassword] = useState(false);
  const [serverError, setServerError] = useState<{
    message: string;
    requestId?: string;
  } | null>(null);

  const setupStatusQuery = useQuery({
    queryKey: ["system", "setup-status"],
    queryFn: () => systemApi.getSetupStatus(),
    staleTime: 60_000,
    retry: false,
  });
  const isUninitialized = setupStatusQuery.data && !setupStatusQuery.data.isInitialized;

  const loginTitleId = useId();
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

  const handleLoginSubmit = async (values: LoginValues) => {
    setServerError(null);
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

  const emailError = loginForm.formState.errors.email;
  const passwordError = loginForm.formState.errors.password;

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
              <h1 id={loginTitleId} className="text-xl font-bold text-slate-950">
                Đăng nhập hệ thống
              </h1>
            </div>
          </div>

          {isUninitialized ? (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-xl border border-blue-200 bg-blue-50 p-3.5 text-xs text-blue-900"
            >
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden={true} />
              <div className="flex-1 space-y-1">
                <p className="font-semibold text-slate-900">Hệ thống chưa có Quản trị viên ban đầu</p>
                <p className="text-slate-600">
                  Đây là cài đặt mới. Vui lòng thiết lập tài khoản Quản trị viên Tối cao để bắt đầu vận hành.
                </p>
                <Link
                  href="/setup"
                  className="inline-flex items-center gap-1 font-semibold text-blue-700 hover:underline pt-0.5"
                >
                  Khởi tạo Quản trị viên ngay →
                </Link>
              </div>
            </div>
          ) : null}

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
              <label htmlFor="password" className="text-sm font-semibold text-slate-900">
                Mật khẩu <span aria-hidden="true" className="text-red-700">*</span>
              </label>
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
        </div>
      </div>

      {isMockApiMode() ? (
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
