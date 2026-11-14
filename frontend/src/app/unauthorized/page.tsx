"use client";

import Link from "next/link";
import { Home, LogIn, LogOut, ShieldX } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { useDocumentTitle } from "@/components/layout/use-document-title";
import {
  getDefaultHomeForUser,
  getDocumentTitleForPathname,
  getRoleLabelVi,
} from "@/lib/auth/roles";

export default function UnauthorizedPage() {
  const { status, user, logout } = useAuth();
  const homeHref = user ? getDefaultHomeForUser(user.roles) : "/login";

  useDocumentTitle(getDocumentTitleForPathname("/unauthorized"));

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-12 sm:px-6">
      <main id="main-content" className="mx-auto max-w-lg">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700">
              <ShieldX className="h-6 w-6" aria-hidden={true} />
            </span>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-800">
                Mã lỗi 403 • Không đủ quyền truy cập
              </p>
              <h1 className="text-2xl font-bold text-slate-950">
                Bạn không có quyền truy cập trang này
              </h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Trang bạn yêu cầu thuộc cổng vai trò khác với quyền hạn hiện tại của tài khoản.
              </p>
            </div>
          </div>

          {status === "authenticated" && user ? (
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700">
              <p>
                Tài khoản hiện tại:{" "}
                <strong className="text-slate-950">{user.fullName}</strong> ({user.email})
              </p>
              <p className="mt-1">
                Vai trò được cấp:{" "}
                <strong className="text-slate-950">
                  {user.roles.map(getRoleLabelVi).join(", ")}
                </strong>
              </p>
            </div>
          ) : null}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href={homeHref}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              {user ? (
                <>
                  <Home className="h-4 w-4" aria-hidden={true} />
                  <span>Về trang chính của tôi</span>
                </>
              ) : (
                <>
                  <LogIn className="h-4 w-4" aria-hidden={true} />
                  <span>Đăng nhập</span>
                </>
              )}
            </Link>

            {user ? (
              <button
                type="button"
                onClick={() => void logout()}
                className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100"
              >
                <LogOut className="h-4 w-4" aria-hidden={true} />
                <span>Đăng xuất & đổi tài khoản</span>
              </button>
            ) : null}
          </div>
        </div>
      </main>
    </div>
  );
}

