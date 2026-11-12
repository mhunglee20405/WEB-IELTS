"use client";

import { AlertTriangle, CheckCircle2, Info, RotateCcw, ShieldAlert } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  DataTable,
  PageHeader,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { penaltiesApi } from "@/lib/api/endpoints";
import { studentKeys } from "@/lib/api/query-keys";
import type { PenaltyRecord } from "@/lib/api/types";
import { formatVnDateTime } from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

const PENALTY_COLUMNS: DataTableColumn<PenaltyRecord>[] = [
  {
    key: "assignment",
    header: "Bài tập & Khóa học",
    renderCell: (row) => (
      <div>
        <p className="font-semibold text-slate-900">{row.assignmentTitle}</p>
        {row.courseTitle ? (
          <p className="text-xs text-slate-600">{row.courseTitle}</p>
        ) : null}
      </div>
    ),
  },
  {
    key: "occurredAt",
    header: "Thời điểm ghi nhận (GMT+7)",
    renderCell: (row) => (
      <span className="text-xs text-slate-700">{formatVnDateTime(row.occurredAt)}</span>
    ),
  },
  {
    key: "points",
    header: "Điểm phạt",
    align: "end",
    renderCell: (row) => (
      <span
        className={cn(
          "inline-flex items-center rounded-md px-2 py-0.5 text-sm font-bold tabular-nums",
          row.reversed
            ? "bg-slate-100 text-slate-700 line-through"
            : "bg-red-50 text-red-900",
        )}
      >
        +{row.points}
      </span>
    ),
  },
  {
    key: "reason",
    header: "Lý do & Dấu vết kiểm toán",
    renderCell: (row) => (
      <div className="space-y-1 text-xs">
        <p className="text-slate-800">{row.reason}</p>
        {row.reversed ? (
          <div className="rounded-md border border-teal-200 bg-teal-50 p-2 text-teal-950">
            <p className="font-semibold">
              Hoàn tác bởi: {row.reversedBy ?? "Quản trị viên"}
              {row.reversedAt ? ` (${formatVnDateTime(row.reversedAt)})` : ""}
            </p>
            {row.reversalReason ? <p>Lý do hoàn tác: {row.reversalReason}</p> : null}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    key: "status",
    header: "Trạng thái",
    renderCell: (row) => (
      <StatusBadge
        status={row.reversed ? "reversed" : "overdue"}
        labelOverride={row.reversed ? "Đã hoàn tác" : "Đang hiệu lực"}
      />
    ),
  },
];

export default function StudentPenaltiesPage() {
  const penaltiesQuery = useQuery({
    queryKey: studentKeys.penaltiesMine,
    queryFn: () => penaltiesApi.getMine(),
  });

  const data = penaltiesQuery.data;
  const records = data?.records ?? [];
  const activeTotal = Math.max(0, data?.totalActivePoints ?? 0);
  const reversedCount = records.filter((r) => r.reversed).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Sổ điểm phạt & Kỷ luật"
        subtitle="Sổ cái bất biến ghi nhận điểm phạt quá hạn (+1 điểm cho mỗi bài quá hạn hiệu lực) và lịch sử hoàn tác có kiểm toán."
      />

      <section aria-label="Tổng hợp điểm phạt" className="grid gap-4 sm:grid-cols-3">
        <article className="lms-card border-red-200 bg-red-50/40">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span>Tổng điểm phạt đang hiệu lực</span>
            <ShieldAlert className="h-4 w-4 text-red-700" aria-hidden={true} />
          </div>
          <p className="text-3xl font-bold tabular-nums text-red-900">{activeTotal}</p>
        </article>

        <article className="lms-card">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Tổng bản ghi đã phát sinh</span>
            <AlertTriangle className="h-4 w-4 text-amber-700" aria-hidden={true} />
          </div>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{records.length}</p>
        </article>

        <article className="lms-card">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Bản ghi đã được hoàn tác</span>
            <RotateCcw className="h-4 w-4 text-teal-700" aria-hidden={true} />
          </div>
          <p className="text-3xl font-bold tabular-nums text-slate-900">{reversedCount}</p>
        </article>
      </section>

      <div className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
        {activeTotal === 0 ? (
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden={true} />
        ) : (
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden={true} />
        )}
        <p>
          Mỗi bài tập quá hạn nộp (`effectiveDueAt` theo Asia/Ho_Chi_Minh) sẽ tự động ghi
          nhận duy nhất <strong>+1 điểm phạt</strong>. Sổ điểm phạt giữ nguyên tính minh bạch
          bất biến; mọi điều chỉnh hợp lệ của Quản trị viên được ghi thành giao dịch hoàn tác
          riêng kèm lý do kiểm toán.
        </p>
      </div>

      <DataTable
        caption="Lịch sử ghi nhận điểm phạt và hoàn tác"
        columns={PENALTY_COLUMNS}
        rows={records}
        getRowKey={(row) => row.id}
        isLoading={penaltiesQuery.isLoading}
        isError={penaltiesQuery.isError}
        error={penaltiesQuery.error}
        onRetry={() => void penaltiesQuery.refetch()}
        emptyTitle="Không có bản ghi điểm phạt nào"
        emptyDescription="Bạn đang duy trì tiến độ hoàn thành bài tập đúng hạn rất tốt."
      />
    </div>
  );
}

