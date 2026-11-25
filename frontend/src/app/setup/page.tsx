"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Lock,
  Mail,
  User,
  Phone,
  KeyRound,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
} from "lucide-react";
import { systemApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { QueryState } from "@/components/ui";

const PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&#^_\-])[A-Za-z\d@$!%*?&#^_\-]{8,}$/;

export default function SetupPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const statusQuery = useQuery({
    queryKey: ["system", "setup-status"],
    queryFn: () => systemApi.getSetupStatus(),
  });

  const bootstrapMutation = useMutation({
    mutationFn: systemApi.bootstrapAdmin,
    onSuccess: async (data) => {
      setSuccessMessage(data.message || "Khởi tạo Quản trị viên thành công!");
      await queryClient.invalidateQueries({ queryKey: ["system", "setup-status"] });
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setValidationError(null);

    if (!fullName.trim() || fullName.trim().length < 2) {
      setValidationError("Họ và tên Quản trị viên phải có ít nhất 2 ký tự.");
      return;
    }

    if (!email.trim() || !email.includes("@")) {
      setValidationError("Vui lòng nhập địa chỉ email hợp lệ.");
      return;
    }

    if (!PASSWORD_REGEX.test(password)) {
      setValidationError(
        "Mật khẩu phải có ít nhất 8 ký tự, gồm chữ hoa, chữ thường, chữ số và ít nhất một ký tự đặc biệt (@$!%*?&#^_-).",
      );
      return;
    }

    if (password !== confirmPassword) {
      setValidationError("Mật khẩu xác nhận không khớp.");
      return;
    }

    if (!setupToken.trim()) {
      setValidationError("Vui lòng nhập Mã thiết lập (Setup Token) từ tệp .bootstrap-token trên máy chủ.");
      return;
    }

    bootstrapMutation.mutate({
      fullName: fullName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim() || undefined,
      password,
      setupToken: setupToken.trim(),
    });
  };

  const isAlreadyInitialized = statusQuery.data?.isInitialized;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 px-4 py-12 sm:px-6 lg:px-8">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-700 text-white shadow-lg shadow-blue-700/20">
            <ShieldCheck className="h-8 w-8" aria-hidden={true} />
          </div>
          <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-slate-900">
            Khởi tạo Hệ thống
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            Thiết lập tài khoản Quản trị viên Tối cao (Super Admin) đầu tiên cho WEB-IELTS.
          </p>
        </div>

        <QueryState
          isLoading={statusQuery.isLoading}
          isError={statusQuery.isError}
          error={statusQuery.error}
          onRetry={() => void statusQuery.refetch()}
          loadingLabel="Đang kiểm tra trạng thái hệ thống..."
        >
          {successMessage ? (
            <div className="rounded-2xl border border-emerald-200 bg-white p-8 shadow-sm text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden={true} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Khởi tạo Thành công!</h2>
              <p className="text-sm text-slate-600">{successMessage}</p>
              <p className="text-xs text-slate-700 font-mono">Tài khoản: {email}</p>
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
                >
                  Đăng nhập với Quản trị viên mới
                  <ArrowRight className="h-4 w-4" aria-hidden={true} />
                </button>
              </div>
            </div>
          ) : isAlreadyInitialized ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm text-center space-y-4">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                <CheckCircle2 className="h-6 w-6" aria-hidden={true} />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Hệ thống đã được khởi tạo</h2>
              <p className="text-sm text-slate-600">
                Hệ thống đã có quản trị viên. Để đảm bảo an toàn, cổng thiết lập ban đầu đã được đóng vĩnh viễn.
              </p>
              <div className="pt-2">
                <Link
                  href="/login"
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800"
                >
                  Đi tới trang Đăng nhập
                  <ArrowRight className="h-4 w-4" aria-hidden={true} />
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <form onSubmit={handleSubmit} className="space-y-4">
                {validationError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden={true} />
                    <span>{validationError}</span>
                  </div>
                ) : null}

                {bootstrapMutation.isError ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-4 text-xs font-medium text-red-800"
                  >
                    <AlertCircle className="h-4 w-4 shrink-0 text-red-600 mt-0.5" aria-hidden={true} />
                    <span>{getFriendlyErrorMessage(bootstrapMutation.error)}</span>
                  </div>
                ) : null}

                <div>
                  <label htmlFor="setup-fullname" className="block text-xs font-semibold text-slate-700">
                    Họ và tên Quản trị viên <span className="text-red-700">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Nguyễn Văn Quản Trị"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-email" className="block text-xs font-semibold text-slate-700">
                    Địa chỉ Email Quản trị viên <span className="text-red-700">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="admin@yourdomain.com"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-phone" className="block text-xs font-semibold text-slate-700">
                    Số điện thoại liên hệ
                  </label>
                  <div className="relative mt-1.5">
                    <Phone className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-phone"
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="0901234567"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-password" className="block text-xs font-semibold text-slate-700">
                    Mật khẩu quản trị <span className="text-red-700">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-password"
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-600">
                    Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt.
                  </p>
                </div>

                <div>
                  <label htmlFor="setup-confirm-password" className="block text-xs font-semibold text-slate-700">
                    Xác nhận mật khẩu <span className="text-red-700">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-confirm-password"
                      type="password"
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="setup-token" className="block text-xs font-semibold text-slate-700">
                    Mã thiết lập (Setup Token) <span className="text-red-700">*</span>
                  </label>
                  <div className="relative mt-1.5">
                    <KeyRound className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" aria-hidden={true} />
                    <input
                      id="setup-token"
                      type="password"
                      required
                      value={setupToken}
                      onChange={(e) => setSetupToken(e.target.value)}
                      placeholder="Nhập mã từ tệp .bootstrap-token trên máy chủ"
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-700"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-slate-500">
                    Mã kích hoạt một lần được tạo tự động trong tệp <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">.bootstrap-token</code> hoặc biến môi trường <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[10px] text-slate-800">SETUP_TOKEN</code>.
                  </p>
                </div>

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={bootstrapMutation.isPending}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-700 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {bootstrapMutation.isPending ? "Đang thiết lập..." : "Khởi tạo Quản trị viên"}
                    <ArrowRight className="h-4 w-4" aria-hidden={true} />
                  </button>
                </div>

                <div className="text-center pt-2">
                  <Link href="/login" className="text-xs font-semibold text-blue-700 hover:underline">
                    Quay lại trang Đăng nhập
                  </Link>
                </div>
              </form>
            </div>
          )}
        </QueryState>
      </div>
    </div>
  );
}
