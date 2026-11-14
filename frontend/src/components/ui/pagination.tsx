"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface PaginationProps {
  page: number;
  totalPages: number;
  totalItems?: number;
  onPageChange: (nextPage: number) => void;
  className?: string;
}

export function Pagination({
  page,
  totalPages,
  totalItems,
  onPageChange,
  className,
}: PaginationProps) {
  if (totalPages <= 1) {
    if (totalItems === undefined || totalItems <= 0) {
      return null;
    }
    return (
      <p className={cn("pt-1 text-xs font-medium text-slate-700", className)}>
        Hiển thị toàn bộ <span className="font-semibold text-slate-900">{totalItems}</span> mục
      </p>
    );
  }

  const safeTotalPages = Math.max(1, totalPages);
  const startPage = Math.max(1, page - 2);
  const endPage = Math.min(safeTotalPages, startPage + 4);
  const pages: number[] = [];
  for (let p = startPage; p <= endPage; p += 1) {
    pages.push(p);
  }

  return (
    <nav
      aria-label="Phân trang"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 pt-2 text-sm text-slate-700",
        className,
      )}
    >
      <p className="text-slate-700">
        Trang <span className="font-semibold text-slate-900">{page}</span> / {safeTotalPages}
        {totalItems !== undefined ? ` (${totalItems} mục)` : ""}
      </p>

      <div className="flex items-center gap-1.5">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Trang trước"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden={true} />
          <span className="hidden sm:inline">Trước</span>
        </button>

        {pages.map((p) => (
          <button
            key={p}
            type="button"
            aria-current={p === page ? "page" : undefined}
            onClick={() => onPageChange(p)}
            className={cn(
              "inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition-colors",
              p === page
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50",
            )}
          >
            {p}
          </button>
        ))}

        <button
          type="button"
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Trang sau"
          className="inline-flex min-h-10 min-w-10 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45"
        >
          <span className="hidden sm:inline">Sau</span>
          <ChevronRight className="h-4 w-4" aria-hidden={true} />
        </button>
      </div>
    </nav>
  );
}

