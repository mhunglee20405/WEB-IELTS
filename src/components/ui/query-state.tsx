"use client";

import { AlertCircle, Inbox, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";

export interface QueryStateProps {
  isLoading: boolean;
  isError?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  loadingLabel?: string;
  skeleton?: ReactNode;
  children: ReactNode;
}

function DefaultSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <div className="h-5 w-48 animate-pulse rounded bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-slate-200" />
      <div className="h-24 w-full animate-pulse rounded-lg bg-slate-200" />
    </div>
  );
}

export function QueryState({
  isLoading,
  isError = false,
  error,
  isEmpty = false,
  onRetry,
  emptyTitle = "Chưa có dữ liệu",
  emptyDescription = "Hiện tại chưa có mục nào phù hợp để hiển thị.",
  emptyAction,
  loadingLabel = "Đang tải dữ liệu...",
  skeleton,
  children,
}: QueryStateProps) {
  if (isLoading) {
    return (
      <div aria-busy="true" className="rounded-xl border border-slate-200 bg-white p-6">
        <span className="sr-only">{loadingLabel}</span>
        {skeleton ?? <DefaultSkeleton />}
      </div>
    );
  }

  if (isError) {
    const requestId = error instanceof ApiError ? error.requestId : undefined;
    const message = getFriendlyErrorMessage(error);

    return (
      <div
        role="alert"
        className="flex flex-col items-start gap-3 rounded-xl border border-red-300 bg-red-50 p-6 text-red-950"
      >
        <div className="flex items-start gap-3">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-700" aria-hidden={true} />
          <div className="space-y-1">
            <h2 className="text-base font-semibold text-red-950">Không thể tải dữ liệu</h2>
            <p className="text-sm text-red-900">{message}</p>
            {requestId ? (
              <p className="text-xs font-mono text-red-800">Mã tra cứu: {requestId}</p>
            ) : null}
          </div>
        </div>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-400 bg-white px-4 py-2 text-sm font-semibold text-red-900 transition-colors hover:bg-red-100"
          >
            <RefreshCw className="h-4 w-4" aria-hidden={true} />
            <span>Thử lại</span>
          </button>
        ) : null}
      </div>
    );
  }

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-600">
          <Inbox className="h-6 w-6" aria-hidden={true} />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-slate-900">{emptyTitle}</h2>
          <p className="max-w-md text-sm text-slate-600">{emptyDescription}</p>
        </div>
        {emptyAction ? <div className="pt-1">{emptyAction}</div> : null}
      </div>
    );
  }

  return <>{children}</>;
}

