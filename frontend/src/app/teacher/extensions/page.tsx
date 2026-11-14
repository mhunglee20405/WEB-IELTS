"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, XCircle } from "lucide-react";
import {
  DataTable,
  ModalDialog,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { extensionsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { teacherKeys } from "@/lib/api/query-keys";
import { ExtensionDecisionFormSchema } from "@/lib/api/schemas";
import type { ExtensionRequestItem } from "@/lib/api/types";
import { formatVnDateTime } from "@/lib/time/vn-time";

interface DecisionModalState {
  item: ExtensionRequestItem;
  decision: "approved" | "rejected";
}

function DecisionDialogForm({
  target,
  onClose,
  onDecided,
}: {
  target: DecisionModalState;
  onClose: () => void;
  onDecided: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [decisionNote, setDecisionNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { decision: "approved" | "rejected"; decisionNote: string }) =>
      extensionsApi.decide(target.item.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["teacher", "extensions"] });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
      onDecided(
        target.decision === "approved"
          ? `Đã phê duyệt gia hạn cho học viên ${target.item.studentName ?? target.item.studentId}.`
          : `Đã từ chối yêu cầu gia hạn của học viên ${target.item.studentName ?? target.item.studentId}.`,
      );
      onClose();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = ExtensionDecisionFormSchema.safeParse({ decisionNote });
    if (!parsed.success) {
      setNoteError(parsed.error.issues[0]?.message ?? "Ghi chú không hợp lệ.");
      return;
    }
    setNoteError(null);
    mutation.mutate({
      decision: target.decision,
      decisionNote: parsed.data.decisionNote,
    });
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

      <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
        <p>
          <strong>Học viên:</strong> {target.item.studentName ?? target.item.studentId}
        </p>
        <p>
          <strong>Bài tập:</strong> {target.item.assignmentTitle}
        </p>
        <p>
          <strong>Hạn cũ → Xin gia hạn đến:</strong>{" "}
          {formatVnDateTime(target.item.currentDueAt)} →{" "}
          <strong>{formatVnDateTime(target.item.requestedDueAt)}</strong>
        </p>
        <p>
          <strong>Lý do học viên nêu:</strong> {target.item.reason}
        </p>
      </div>

      <div>
        <label htmlFor="ext-decision-note" className="block text-sm font-medium text-slate-900">
          Ghi chú phản hồi gửi học viên <span className="text-red-700">*</span>
        </label>
        <textarea
          id="ext-decision-note"
          rows={3}
          autoFocus
          value={decisionNote}
          onChange={(e) => {
            setDecisionNote(e.target.value);
            setNoteError(null);
          }}
          aria-invalid={Boolean(noteError)}
          aria-describedby={noteError ? "ext-decision-note-err" : undefined}
          placeholder={
            target.decision === "approved"
              ? "VD: Đồng ý gia hạn thêm 24h do lý do sức khỏe..."
              : "VD: Không thể gia hạn quá thời điểm chữa bài chung..."
          }
          className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-2.5 text-sm text-slate-950"
        />
        {noteError ? (
          <p id="ext-decision-note-err" className="mt-1 text-xs font-medium text-red-700">
            {noteError}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className="inline-flex min-h-[44px] items-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className={
            target.decision === "approved"
              ? "inline-flex min-h-[44px] items-center rounded-lg bg-emerald-700 px-5 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-60"
              : "inline-flex min-h-[44px] items-center rounded-lg bg-red-700 px-5 py-2 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-60"
          }
        >
          {mutation.isPending
            ? "Đang xử lý..."
            : target.decision === "approved"
              ? "Xác nhận phê duyệt"
              : "Xác nhận từ chối"}
        </button>
      </div>
    </form>
  );
}

export default function TeacherExtensionsPage() {
  const [page, setPage] = useState(1);
  const [modalTarget, setModalTarget] = useState<DecisionModalState | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: teacherKeys.extensionsPending(page),
    queryFn: () => extensionsApi.listPending({ page, limit: 20 }),
    placeholderData: keepPreviousData,
  });

  const rows = query.data?.items ?? [];

  const columns: DataTableColumn<ExtensionRequestItem>[] = [
    {
      key: "student",
      header: "Học viên & Bài tập",
      renderCell: (row) => (
        <div>
          <p className="font-semibold text-slate-950">{row.studentName ?? row.studentId}</p>
          <p className="text-xs text-slate-700">{row.assignmentTitle}</p>
          {row.courseTitle ? (
            <p className="text-xs text-slate-700">{row.courseTitle}</p>
          ) : null}
        </div>
      ),
    },
    {
      key: "reason",
      header: "Lý do xin gia hạn",
      renderCell: (row) => <p className="max-w-xs text-xs text-slate-700">{row.reason}</p>,
    },
    {
      key: "requestedDueAt",
      header: "Hạn cũ → Đề xuất mới",
      renderCell: (row) => (
        <div className="text-xs">
          <p className="text-slate-600">{formatVnDateTime(row.currentDueAt)}</p>
          <p className="font-semibold text-blue-900">
            → {formatVnDateTime(row.requestedDueAt)}
          </p>
        </div>
      ),
    },
    {
      key: "status",
      header: "Trạng thái",
      renderCell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "actions",
      header: "Phê duyệt",
      align: "end",
      renderCell: (row) => (
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={() => setModalTarget({ item: row, decision: "approved" })}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden={true} />
            Phê duyệt
          </button>
          <button
            type="button"
            onClick={() => setModalTarget({ item: row, decision: "rejected" })}
            className="inline-flex min-h-[44px] items-center gap-1 rounded-lg border border-red-300 bg-white px-3 text-xs font-semibold text-red-800 hover:bg-red-50"
          >
            <XCircle className="h-3.5 w-3.5" aria-hidden={true} />
            Từ chối
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hàng chờ duyệt gia hạn"
        subtitle="Xem xét lý do xin gia hạn hạn nộp bài từ học viên và cập nhật thời hạn hiệu lực."
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

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải danh sách yêu cầu gia hạn..."
      >
        <DataTable
          caption={`Yêu cầu gia hạn chờ xử lý (${query.data?.total ?? rows.length})`}
          columns={columns}
          rows={rows}
          getRowKey={(row) => row.id}
          emptyTitle="Không có yêu cầu gia hạn nào chờ duyệt"
          emptyDescription="Tất cả yêu cầu xin gia hạn đã được xử lý."
        />

        {query.data ? (
          <Pagination
            page={query.data.page}
            totalPages={query.data.totalPages}
            totalItems={query.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </QueryState>

      <ModalDialog
        open={Boolean(modalTarget)}
        onClose={() => setModalTarget(null)}
        title={
          modalTarget?.decision === "approved"
            ? "Phê duyệt yêu cầu gia hạn"
            : "Từ chối yêu cầu gia hạn"
        }
      >
        {modalTarget ? (
          <DecisionDialogForm
            key={`${modalTarget.item.id}-${modalTarget.decision}`}
            target={modalTarget}
            onClose={() => setModalTarget(null)}
            onDecided={setFeedback}
          />
        ) : null}
      </ModalDialog>
    </div>
  );
}
