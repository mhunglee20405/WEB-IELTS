"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { BookOpen, LogIn } from "lucide-react";
import { useAuth } from "@/components/auth/auth-provider";
import { getDefaultHomeForUser } from "@/lib/auth/roles";

export default function HomePage() {
  const { status, user } = useAuth();
  const router = useRouter();

  const targetHref =
    status === "authenticated" && user ? getDefaultHomeForUser(user.roles) : "/login";

  useEffect(() => {
    if (status === "authenticated" && user) {
      router.replace(getDefaultHomeForUser(user.roles));
    } else if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, user, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <main
        id="main-content"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm"
      >
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-blue-700 text-white">
          <BookOpen className="h-6 w-6" aria-hidden={true} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-950">IELTS Academic LMS</h1>
        <p className="mt-2 text-sm text-slate-600">
          {status === "loading"
            ? "Đang kiểm tra phiên đăng nhập..."
            : "Đang chuyển hướng đến cổng làm việc phù hợp..."}
        </p>
        <div className="mt-6">
          <Link
            href={targetHref}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800"
          >
            <LogIn className="h-4 w-4" aria-hidden={true} />
            <span>{user ? "Vào trang chính" : "Đến trang đăng nhập"}</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
