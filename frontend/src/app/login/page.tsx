import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: "Đăng nhập hệ thống | IELTS Academic LMS",
};

function LoginFallback() {
  return (
    <div
      aria-busy="true"
      className="lms-auth-card w-full max-w-md space-y-4 rounded-2xl border border-slate-200/80 bg-white p-6 sm:p-8"
    >
      <span className="sr-only">Đang tải biểu mẫu đăng nhập...</span>
      <div className="h-8 w-48 animate-pulse rounded bg-slate-200" aria-hidden={true} />
      <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" aria-hidden={true} />
      <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" aria-hidden={true} />
      <div className="h-12 w-full animate-pulse rounded-lg bg-slate-200" aria-hidden={true} />
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="lms-auth-canvas relative flex min-h-dvh w-full flex-col items-center justify-center overflow-x-clip px-4 py-6 sm:px-6 sm:py-8">
      <div
        aria-hidden={true}
        className="lms-auth-decor pointer-events-none absolute inset-0 overflow-hidden"
      >
        <div className="lms-auth-pattern absolute inset-0" />
        <div className="absolute left-4 top-4 h-72 w-72 rounded-full bg-blue-600/15 blur-3xl" />
        <div className="absolute bottom-6 right-8 h-80 w-80 rounded-full bg-blue-500/15 blur-3xl" />
        <div className="absolute right-[12%] top-[14%] h-64 w-64 rounded-full bg-slate-300/20 blur-3xl" />
      </div>

      <main
        id="main-content"
        className="relative z-10 flex w-full max-w-7xl flex-1 flex-col items-center justify-center"
      >
        <Suspense fallback={<LoginFallback />}>
          <LoginForm />
        </Suspense>
      </main>
    </div>
  );
}

