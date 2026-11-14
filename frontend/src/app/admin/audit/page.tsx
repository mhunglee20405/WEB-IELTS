"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, RotateCcw, ShieldCheck } from "lucide-react";
import {
  buttonVariants,
  DataTable,
  MetaTag,
  ModalDialog,
  PageHeader,
  QueryState,
  StatusBadge,
  TabPanel,
  Tabs,
  Toolbar,
  type DataTableColumn,
  type TabItem,
} from "@/components/ui";
import { penaltiesApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { adminKeys } from "@/lib/api/query-keys";
import { ReversePenaltyFormSchema } from "@/lib/api/schemas";
import type { PenaltyRecord } from "@/lib/api/types";
import { fetchAllPenaltiesForAudit } from "@/lib/teacher/data-helpers";
import { formatVnDateTime } from "@/lib/time/vn-time";

type AuditFilter = "all" | "active" | "reversed";

const AUDIT_TABS: readonly TabItem<AuditFilter>[] = [
  { id: "all", label: "Tất cả" },
  { id: "active", label: "Đang hiệu lực" },
  { id: "reversed", label: "Đã hoàn tác" },
];

function ReversePenaltyModalForm({
  penalty,
  onClose,
  onReversed,
}: {
  penalty: PenaltyRecord;
  onClose: () => void;
  onReversed: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { reason: string }) => penaltiesApi.reverse(penalty.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.auditPenalties });
      onReversed(
        `Đã hoàn tác điểm phạt (${penalty.assignmentTitle}) cho ${
          penalty.studentName ?? penalty.studentId
        } và ghi nhật ký kiểm toán.`,
      );
      onClose();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = ReversePenaltyFormSchema.safeParse({ reason });
    if (!parsed.success) {
      setReasonError(parsed.error.issues[0]?.message ?? "Lý do không hợp lệ.");
      return;
    }
    setReasonError(null);
    mutation.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {mutation.isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(mutation.error)}</span>
        </div>
      ) : null}

      <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950 space-y-1">
        <p className="font-semibold">Thao tác đặc quyền Quản trị viên (lưu nhật ký bất biến)</p>
        <p>
          Học viên: <strong>{penalty.studentName ?? penalty.studentId}</strong> · Bài tập:{" "}
          <strong>{penalty.assignmentTitle}</strong> (+{penalty.points} điểm)
        </p>
        <p>Lý do phạt ban đầu: {penalty.reason}</p>
      </div>

      <div>
        <label htmlFor="reverse-reason" className="block text-sm font-medium text-slate-900">
          Lý do hoàn tác bắt buộc <span className="text-red-700">*</span>
        </label>
        <textarea
          id="reverse-reason"
          rows={3}
          autoFocus
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setReasonError(null);
          }}
          aria-invalid={Boolean(reasonError)}
          aria-describedby={reasonError ? "reverse-reason-err" : undefined}
          placeholder="Ghi rõ căn cứ miễn/hoàn tác điểm phạt (tối thiểu 10 ký tự)..."
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"
        />
        {reasonError ? (
          <p id="reverse-reason-err" className="mt-1 text-xs font-medium text-red-700">
            {reasonError}
          </p>
        ) : null}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Giữ nguyên phạt
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
        >
          <RotateCcw className="h-4 w-4" aria-hidden={true} />
          {mutation.isPending ? "Đang hoàn tác..." : "Xác nhận hoàn tác phạt"}
        </button>
      </div>
    </form>
  );
}

export default function AdminAuditPage() {
  const tabsPrefix = useId();
  const [filter, setFilter] = useState<AuditFilter>("all");
  const [reversingPenalty, setReversingPenalty] = useState<PenaltyRecord | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminKeys.auditPenalties,
    queryFn: () => fetchAllPenaltiesForAudit(),
  });

  const rows = useMemo(() => {
    const all = query.data ?? [];
    if (filter === "active") return all.filter((p) => !p.reversed);
    if (filter === "reversed") return all.filter((p) => p.reversed);
    return all;
  }, [query.data, filter]);

  const columns: DataTableColumn<PenaltyRecord>[] = [
    {
      key: "student",
      header: "Học viên & Bài tập",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.studentName ?? row.studentId}</p>
          <p className="text-xs text-slate-700">{row.assignmentTitle}</p>
          {row.courseTitle ? <p className="text-xs text-slate-600">{row.courseTitle}</p> : null}
        </div>
      ),
    },
    {
      key: "points",
      header: "Điểm",
      renderCell: (row) => <span className="font-bold text-red-800 tabular-nums">+{row.points}</span>,
    },
    {
      key: "reason",
      header: "Lý do ghi nhận",
      renderCell: (row) => (
        <div className="max-w-xs text-xs">
          <p className="text-slate-800">{row.reason}</p>
          <p className="mt-0.5 text-slate-600">{formatVnDateTime(row.occurredAt)}</p>
        </div>
      ),
    },
    {
      key: "audit",
      header: "Trạng thái & Dấu vết kiểm toán",
      renderCell: (row) =>
        row.reversed ? (
          <div className="space-y-1 text-xs">
            <StatusBadge status="reversed" />
            <p className="text-slate-700">
              Hoàn tác bởi: <strong>{row.reversedBy ?? "Admin"}</strong>
            </p>
            {row.reversalReason ? (
              <p className="text-slate-600">Lý do: {row.reversalReason}</p>
            ) : null}
          </div>
        ) : (
          <StatusBadge status="overdue" labelOverride="Đang hiệu lực" />
        ),
    },
    {
      key: "actions",
      header: "Can thiệp",
      align: "end",
      renderCell: (row) =>
        !row.reversed ? (
          <button
            type="button"
            onClick={() => setReversingPenalty(row)}
            className={buttonVariants({ variant: "danger", size: "sm" })}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden={true} />
            Hoàn tác phạt
          </button>
        ) : (
          <span className="text-xs font-medium text-slate-700">Đã khóa kiểm toán</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiểm toán & Hoàn tác điểm phạt"
        subtitle="Giám sát toàn bộ bản ghi điểm phạt quá hạn và thực hiện hoàn tác có lưu lý do kiểm toán."
      />

      {feedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{feedback}</span>
        </div>
      ) : null}

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc trạng thái kiểm toán phạt"
            items={AUDIT_TABS}
            value={filter}
            onChange={setFilter}
          />
        }
      >
        <MetaTag variant="neutral">
          <ShieldCheck className="h-3.5 w-3.5 text-blue-700" aria-hidden={true} />
          Chỉ Quản trị viên có quyền hoàn tác điểm phạt
        </MetaTag>
      </Toolbar>

      <TabPanel idPrefix={tabsPrefix} value={filter} activeValue={filter}>
        <QueryState
          isLoading={query.isLoading}
          isError={query.isError}
          error={query.error}
          onRetry={() => void query.refetch()}
          loadingLabel="Đang tải sổ kiểm toán điểm phạt..."
        >
          <DataTable
            caption={`Nhật ký điểm phạt toàn hệ thống (${rows.length})`}
            columns={columns}
            rows={rows}
            getRowKey={(row) => row.id}
            emptyTitle="Không có bản ghi điểm phạt nào"
            emptyDescription="Chưa phát sinh điểm phạt hoặc không có mục nào khớp bộ lọc."
          />
        </QueryState>
      </TabPanel>

      <ModalDialog
        open={Boolean(reversingPenalty)}
        onClose={() => setReversingPenalty(null)}
        title="Hoàn tác điểm phạt có kiểm toán"
      >
        {reversingPenalty ? (
          <ReversePenaltyModalForm
            key={reversingPenalty.id}
            penalty={reversingPenalty}
            onClose={() => setReversingPenalty(null)}
            onReversed={setFeedback}
          />
        ) : null}
      </ModalDialog>
    </div>
  );
}
