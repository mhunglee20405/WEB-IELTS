"use client";

import { CalendarClock, CheckCircle2, Clock, Send, ShieldAlert } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  DataTable,
  PageHeader,
  Pagination,
  QueryState,
  StatusBadge,
  type DataTableColumn,
} from "@/components/ui";
import { assignmentsApi, authApi, extensionsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import {
  MAX_EXTENSIONS_PER_MONTH,
  type ExtensionRequestItem,
  type StudentAssignmentSummary,
} from "@/lib/api/types";
import { useNowMs } from "@/lib/time/use-now";
import {
  addDaysToDateKey,
  formatDateKeyVi,
  formatVnDateTime,
  getMonthKeyInTimezone,
  getVnDailyWindowSync,
  getZonedDateParts,
} from "@/lib/time/vn-time";

function getInclusiveDueDateKey(effectiveDueAtIso: string): string {
  const dueMs = Date.parse(effectiveDueAtIso);
  if (Number.isNaN(dueMs)) {
    return getZonedDateParts(new Date()).dateKey;
  }
  // Effective due boundaries use exclusive next-day 00:00 UTC; subtract 1s to get inclusive VN date
  return getZonedDateParts(dueMs - 1000).dateKey;
}

const EXTENSION_COLUMNS: DataTableColumn<ExtensionRequestItem>[] = [
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
    key: "dates",
    header: "Mốc hạn nộp (GMT+7)",
    renderCell: (row) => (
      <div className="space-y-0.5 text-xs">
        <p className="text-slate-600">
          Hạn cũ: <span className="font-medium">{formatVnDateTime(row.currentDueAt)}</span>
        </p>
        <p className="font-semibold text-blue-900">
          Xin dời đến: {formatVnDateTime(row.requestedDueAt)}
        </p>
      </div>
    ),
  },
  {
    key: "reason",
    header: "Lý do & Phản hồi",
    renderCell: (row) => (
      <div className="space-y-1 text-xs">
        <p className="text-slate-800">{row.reason}</p>
        {row.decisionNote ? (
          <p className="rounded bg-slate-100 px-2 py-1 text-slate-700">
            <strong className="font-semibold">Giảng viên:</strong> {row.decisionNote}
          </p>
        ) : null}
      </div>
    ),
  },
  {
    key: "status",
    header: "Trạng thái",
    renderCell: (row) => (
      <div className="space-y-1">
        <StatusBadge status={row.status} />
        <p className="text-xs text-slate-600">
          Gửi lúc: {formatVnDateTime(row.createdAt)}
        </p>
      </div>
    ),
  },
];

interface ExtensionFormProps {
  eligibleAssignments: StudentAssignmentSummary[];
  initialSelectedId: string;
  usedThisMonth: number;
  maxPerMonth: number;
  todayKey: string;
}

function ExtensionRequestForm({
  eligibleAssignments,
  initialSelectedId,
  usedThisMonth,
  maxPerMonth,
  todayKey,
}: ExtensionFormProps) {
  const queryClient = useQueryClient();
  const resolvedDefaultId =
    eligibleAssignments.find((a) => a.studentAssignmentId === initialSelectedId)
      ?.studentAssignmentId ??
    eligibleAssignments[0]?.studentAssignmentId ??
    "";

  const [selectedAssignmentId, setSelectedAssignmentId] =
    useState<string>(resolvedDefaultId);
  const selectedAssignment = useMemo(
    () =>
      eligibleAssignments.find(
        (item) => item.studentAssignmentId === selectedAssignmentId,
      ) ?? null,
    [eligibleAssignments, selectedAssignmentId],
  );

  const minTargetDate = useMemo(() => {
    if (!selectedAssignment) return addDaysToDateKey(todayKey, 1);
    const dueDateKey = getInclusiveDueDateKey(selectedAssignment.effectiveDueAt);
    const nextAfterDue = addDaysToDateKey(dueDateKey, 1);
    const tomorrowKey = addDaysToDateKey(todayKey, 1);
    return nextAfterDue > tomorrowKey ? nextAfterDue : tomorrowKey;
  }, [selectedAssignment, todayKey]);

  const [requestedDate, setRequestedDate] = useState<string>(() => minTargetDate);
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [successBanner, setSuccessBanner] = useState<string | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);

  const handleAssignmentSelect = (nextId: string) => {
    setSelectedAssignmentId(nextId);
    const found = eligibleAssignments.find((a) => a.studentAssignmentId === nextId);
    if (found) {
      const nextAfterDue = addDaysToDateKey(
        getInclusiveDueDateKey(found.effectiveDueAt),
        1,
      );
      const tomorrowKey = addDaysToDateKey(todayKey, 1);
      setRequestedDate(nextAfterDue > tomorrowKey ? nextAfterDue : tomorrowKey);
    }
    setValidationError(null);
    setServerError(null);
  };

  const requestMutation = useMutation({
    mutationFn: (payload: {
      studentAssignmentId: string;
      requestedDueAt: string;
      reason: string;
    }) =>
      extensionsApi.requestForAssignment(payload.studentAssignmentId, {
        requestedDueAt: payload.requestedDueAt,
        reason: payload.reason,
      }),
    onSuccess: async () => {
      setServerError(null);
      setValidationError(null);
      setReason("");
      setSuccessBanner(
        "Đã gửi yêu cầu gia hạn thành công. Giảng viên sẽ xem xét và phản hồi cho bạn.",
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["student", "extensions"] }),
        queryClient.invalidateQueries({ queryKey: studentKeys.profile }),
        queryClient.invalidateQueries({ queryKey: studentKeys.dashboard }),
      ]);
    },
    onError: (err) => {
      setSuccessBanner(null);
      setServerError(getFriendlyErrorMessage(err));
    },
  });

  const isQuotaExhausted = usedThisMonth >= maxPerMonth;
  const effectiveDateValue =
    requestedDate >= minTargetDate ? requestedDate : minTargetDate;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSuccessBanner(null);
    setServerError(null);

    if (!selectedAssignmentId) {
      setValidationError("Vui lòng chọn một bài tập chưa đạt để xin gia hạn.");
      return;
    }
    if (!effectiveDateValue || !/^\d{4}-\d{2}-\d{2}$/.test(effectiveDateValue)) {
      setValidationError("Vui lòng chọn ngày hết hạn đề xuất hợp lệ.");
      return;
    }
    const trimmedReason = reason.trim();
    if (trimmedReason.length < 10) {
      setValidationError("Lý do xin gia hạn cần tối thiểu 10 ký tự để giảng viên xét duyệt.");
      return;
    }
    if (trimmedReason.length > 500) {
      setValidationError("Lý do xin gia hạn không vượt quá 500 ký tự.");
      return;
    }

    setValidationError(null);
    const requestedDueAt = getVnDailyWindowSync(effectiveDateValue).endExclusiveUtcIso;
    requestMutation.mutate({
      studentAssignmentId: selectedAssignmentId,
      requestedDueAt,
      reason: trimmedReason,
    });
  };

  return (
    <form
      noValidate
      onSubmit={handleSubmit}
      className="lms-card space-y-4"
      aria-labelledby="extension-form-heading"
    >
      <div className="space-y-1">
        <h2 id="extension-form-heading" className="text-lg font-semibold text-slate-900">
          Gửi yêu cầu gia hạn mới
        </h2>
        <p className="text-sm text-slate-600">
          Mỗi tháng học viên được gửi tối đa {maxPerMonth} yêu cầu gia hạn (tính theo tháng
          dương lịch Asia/Ho_Chi_Minh).
        </p>
      </div>

      {successBanner ? (
        <div
          role="status"
          className="flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-950"
        >
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" aria-hidden={true} />
          <span>{successBanner}</span>
        </div>
      ) : null}

      {validationError || serverError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-950"
        >
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-red-700" aria-hidden={true} />
          <span>{validationError ?? serverError}</span>
        </div>
      ) : null}

      {isQuotaExhausted ? (
        <div
          role="alert"
          className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950"
        >
          Bạn đã sử dụng hết hạn mức {usedThisMonth} / {maxPerMonth} lượt gia hạn trong tháng
          này. Hạn mức sẽ tự động đặt lại vào ngày 01 tháng sau.
        </div>
      ) : null}

      <div className="space-y-1.5">
        <label htmlFor="ext-assignment" className="block text-sm font-medium text-slate-800">
          Chọn bài tập cần gia hạn
        </label>
        <select
          id="ext-assignment"
          disabled={isQuotaExhausted || eligibleAssignments.length === 0}
          value={selectedAssignmentId}
          onChange={(e) => handleAssignmentSelect(e.target.value)}
          className="lms-input"
        >
          {eligibleAssignments.length === 0 ? (
            <option value="">Không còn bài tập nào cần gia hạn</option>
          ) : (
            eligibleAssignments.map((item) => (
              <option key={item.studentAssignmentId} value={item.studentAssignmentId}>
                {item.title} (Hạn hiện tại: {formatVnDateTime(item.effectiveDueAt)})
              </option>
            ))
          )}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="ext-date" className="block text-sm font-medium text-slate-800">
          Hạn nộp mới đề xuất (hết ngày giờ Việt Nam)
        </label>
        <p id="ext-date-hint" className="text-xs text-slate-600">
          Hạn nộp sau khi duyệt sẽ kéo dài tới hết 23:59 ngày{" "}
          <strong>{formatDateKeyVi(effectiveDateValue)}</strong> (Asia/Ho_Chi_Minh).
        </p>
        <input
          id="ext-date"
          type="date"
          min={minTargetDate}
          disabled={isQuotaExhausted || eligibleAssignments.length === 0}
          aria-describedby="ext-date-hint"
          value={effectiveDateValue}
          onChange={(e) => setRequestedDate(e.target.value)}
          className="lms-input"
        />
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <label htmlFor="ext-reason" className="block text-sm font-medium text-slate-800">
            Lý do xin gia hạn
          </label>
          <span className="text-xs tabular-nums text-slate-600">
            {reason.trim().length} / 500 ký tự
          </span>
        </div>
        <p id="ext-reason-hint" className="text-xs text-slate-600">
          Trình bày rõ lý do (tối thiểu 10 ký tự) để giảng viên xem xét phê duyệt.
        </p>
        <textarea
          id="ext-reason"
          rows={4}
          disabled={isQuotaExhausted || eligibleAssignments.length === 0}
          aria-describedby="ext-reason-hint"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ví dụ: Em bị ốm và cần thêm 24 giờ để hoàn thành bài đọc và phần dịch..."
          className="lms-input min-h-[112px] resize-y"
        />
      </div>

      <div>
        <button
          type="submit"
          disabled={
            requestMutation.isPending ||
            isQuotaExhausted ||
            eligibleAssignments.length === 0
          }
          className="inline-flex min-h-[48px] items-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Send className="h-4 w-4" aria-hidden={true} />
          {requestMutation.isPending ? "Đang gửi yêu cầu..." : "Gửi yêu cầu gia hạn"}
        </button>
      </div>
    </form>
  );
}

function ExtensionsContent() {
  const searchParams = useSearchParams();
  const initialSelectedId = searchParams.get("studentAssignmentId") ?? "";
  const [page, setPage] = useState(1);
  const nowMs = useNowMs(60_000);
  const todayKey = getZonedDateParts(nowMs).dateKey;
  const currentMonthKey = getMonthKeyInTimezone(nowMs);

  const extensionsQuery = useQuery({
    queryKey: studentKeys.extensionsMine(page),
    queryFn: () => extensionsApi.listMine({ page, limit: 20 }),
  });

  const assignmentsQuery = useQuery({
    queryKey: studentKeys.assignments("all", "all", 1),
    queryFn: () => assignmentsApi.listMine({ page: 1, limit: 100 }),
  });

  const profileQuery = useQuery({
    queryKey: studentKeys.profile,
    queryFn: () => authApi.getStudentProfile(),
  });

  const eligibleAssignments = useMemo(
    () => (assignmentsQuery.data?.items ?? []).filter((item) => !item.passed),
    [assignmentsQuery.data],
  );

  const rows = extensionsQuery.data?.items ?? [];
  const maxPerMonth =
    profileQuery.data?.maxExtensionsPerMonth ?? MAX_EXTENSIONS_PER_MONTH;
  const usedThisMonth =
    profileQuery.data?.extensionsUsedThisMonth ??
    rows.filter((ext) => getMonthKeyInTimezone(ext.createdAt) === currentMonthKey).length;
  const remainingQuota = Math.max(0, maxPerMonth - usedThisMonth);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Gia hạn nộp bài"
        subtitle={`Quản lý hạn mức gia hạn hàng tháng (${currentMonthKey} · Asia/Ho_Chi_Minh).`}
      />

      <section aria-label="Hạn mức gia hạn tháng hiện tại" className="grid gap-4 sm:grid-cols-3">
        <article className="lms-card">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Đã sử dụng trong tháng</span>
            <Clock className="h-4 w-4 text-amber-700" aria-hidden={true} />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {usedThisMonth} / {maxPerMonth} lượt
          </p>
        </article>

        <article className="lms-card">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Lượt còn lại</span>
            <CalendarClock className="h-4 w-4 text-blue-700" aria-hidden={true} />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {remainingQuota} lượt
          </p>
        </article>

        <article className="lms-card">
          <div className="flex items-center justify-between text-xs font-medium text-slate-600">
            <span>Bài tập đủ điều kiện xin gia hạn</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden={true} />
          </div>
          <p className="text-2xl font-bold tabular-nums text-slate-900">
            {eligibleAssignments.length} bài
          </p>
        </article>
      </section>

      <QueryState
        isLoading={assignmentsQuery.isLoading || profileQuery.isLoading}
        isError={assignmentsQuery.isError}
        error={assignmentsQuery.error}
        onRetry={() => void assignmentsQuery.refetch()}
        loadingLabel="Đang tải danh sách bài tập..."
      >
        <ExtensionRequestForm
          key={`${initialSelectedId}-${eligibleAssignments.length}`}
          eligibleAssignments={eligibleAssignments}
          initialSelectedId={initialSelectedId}
          usedThisMonth={usedThisMonth}
          maxPerMonth={maxPerMonth}
          todayKey={todayKey}
        />
      </QueryState>

      <section aria-label="Lịch sử yêu cầu gia hạn" className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">Lịch sử yêu cầu gia hạn</h2>
        <DataTable
          caption="Danh sách các yêu cầu gia hạn bạn đã gửi trong hệ thống"
          columns={EXTENSION_COLUMNS}
          rows={rows}
          getRowKey={(row) => row.id}
          isLoading={extensionsQuery.isLoading}
          isError={extensionsQuery.isError}
          error={extensionsQuery.error}
          onRetry={() => void extensionsQuery.refetch()}
          emptyTitle="Chưa có yêu cầu gia hạn nào"
          emptyDescription="Khi bạn gửi đơn xin gia hạn cho bài tập chưa đạt, trạng thái phê duyệt sẽ hiển thị tại đây."
        />
        {extensionsQuery.data && extensionsQuery.data.totalPages > 1 ? (
          <Pagination
            page={extensionsQuery.data.page}
            totalPages={extensionsQuery.data.totalPages}
            totalItems={extensionsQuery.data.total}
            onPageChange={setPage}
          />
        ) : null}
      </section>
    </div>
  );
}

export default function StudentExtensionsPage() {
  return (
    <Suspense
      fallback={
        <div className="lms-card text-sm text-slate-600">
          Đang tải trang gia hạn...
        </div>
      }
    >
      <ExtensionsContent />
    </Suspense>
  );
}

