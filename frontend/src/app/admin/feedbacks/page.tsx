"use client";

import { useState, type FormEvent } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, MessageSquareText, Star } from "lucide-react";
import {
  buttonVariants,
  MetaTag,
  ModalDialog,
  PageHeader,
  Pagination,
  QueryState,
  SearchInput,
  StatusBadge,
  Toolbar,
  type BadgeStatus,
} from "@/components/ui";
import { feedbacksApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { adminKeys } from "@/lib/api/query-keys";
import { UpdateFeedbackStatusFormSchema } from "@/lib/api/schemas";
import type { FeedbackCategory, FeedbackItem, FeedbackStatus } from "@/lib/api/types";
import { formatVnDateTime } from "@/lib/time/vn-time";

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  CONTENT: "Nội dung học & đề thi",
  SYSTEM_BUG: "Lỗi hệ thống",
  TEACHING: "Giảng dạy",
  FEATURE_REQUEST: "Đề xuất tính năng",
  OTHER: "Khác",
};

const STATUS_LABELS: Record<FeedbackStatus, string> = {
  NEW: "Mới tiếp nhận",
  REVIEWED: "Đang xem xét",
  RESOLVED: "Đã giải quyết",
};

const STATUS_BADGE_MAP: Record<FeedbackStatus, BadgeStatus> = {
  NEW: "upcoming",
  REVIEWED: "pending",
  RESOLVED: "approved",
};

function TriageFeedbackForm({
  item,
  onClose,
  onUpdated,
}: {
  item: FeedbackItem;
  onClose: () => void;
  onUpdated: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<FeedbackStatus>(item.status);
  const [adminNote, setAdminNote] = useState(item.adminNote ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (payload: { status: FeedbackStatus; adminNote?: string }) =>
      feedbacksApi.updateStatus(item.id, payload),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: adminKeys.feedbacksRoot });
      onUpdated("Đã cập nhật trạng thái xử lý góp ý ẩn danh.");
      onClose();
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = UpdateFeedbackStatusFormSchema.safeParse({
      status,
      adminNote: adminNote.trim() || undefined,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Dữ liệu cập nhật chưa hợp lệ.");
      return;
    }
    setFieldError(null);
    mutation.mutate(parsed.data);
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-4">
      {fieldError ? (
        <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
          {fieldError}
        </div>
      ) : null}

      {mutation.isError ? (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{getFriendlyErrorMessage(mutation.error)}</span>
        </div>
      ) : null}

      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 space-y-1">
        <p className="font-semibold text-slate-900">
          {CATEGORY_LABELS[item.category]} · Ẩn danh
        </p>
        <p className="whitespace-pre-wrap text-slate-800">{item.content}</p>
      </div>

      <div>
        <label htmlFor="triage-feedback-status" className="block text-sm font-medium text-slate-900">
          Trạng thái xử lý
        </label>
        <select
          id="triage-feedback-status"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          className="lms-input mt-1.5"
        >
          <option value="NEW">Mới tiếp nhận</option>
          <option value="REVIEWED">Đang xem xét</option>
          <option value="RESOLVED">Đã giải quyết</option>
        </select>
      </div>

      <div>
        <label htmlFor="triage-feedback-note" className="block text-sm font-medium text-slate-900">
          Ghi chú nội bộ (tùy chọn)
        </label>
        <textarea
          id="triage-feedback-note"
          rows={3}
          maxLength={1000}
          value={adminNote}
          onChange={(e) => setAdminNote(e.target.value)}
          placeholder="Ghi nhận hướng xử lý hoặc phân công kiểm tra..."
          className="lms-input mt-1.5"
        />
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={onClose}
          className={buttonVariants({ variant: "secondary" })}
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={mutation.isPending}
          className={buttonVariants({ variant: "primary" })}
        >
          {mutation.isPending ? "Đang lưu..." : "Lưu trạng thái"}
        </button>
      </div>
    </form>
  );
}

export default function AdminFeedbacksPage() {
  const [statusFilter, setStatusFilter] = useState<"all" | FeedbackStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | FeedbackCategory>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [selectedItem, setSelectedItem] = useState<FeedbackItem | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery({
    queryKey: adminKeys.feedbacks(
      statusFilter === "all" ? undefined : statusFilter,
      categoryFilter === "all" ? undefined : categoryFilter,
      searchTerm,
      page,
    ),
    queryFn: () =>
      feedbacksApi.list({
        status: statusFilter === "all" ? undefined : statusFilter,
        category: categoryFilter === "all" ? undefined : categoryFilter,
        search: searchTerm || undefined,
        page,
        limit: 20,
      }),
    placeholderData: keepPreviousData,
  });

  const items = query.data?.items ?? [];
  const unreadCount = query.data?.unreadCount ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hộp thư góp ý học viên"
        subtitle="Theo dõi và xử lý các góp ý ẩn danh từ học viên (không lưu thông tin định danh)."
        actions={
          <MetaTag variant={unreadCount > 0 ? "warning" : "neutral"}>
            <MessageSquareText className="h-3.5 w-3.5" aria-hidden={true} />
            {unreadCount} góp ý mới chưa xử lý
          </MetaTag>
        }
      />

      {notice ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{notice}</span>
        </div>
      ) : null}

      <Toolbar>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Lọc theo trạng thái"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as "all" | FeedbackStatus);
              setPage(1);
            }}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tất cả trạng thái</option>
            <option value="NEW">Mới tiếp nhận</option>
            <option value="REVIEWED">Đang xem xét</option>
            <option value="RESOLVED">Đã giải quyết</option>
          </select>

          <select
            aria-label="Lọc theo phân loại"
            value={categoryFilter}
            onChange={(e) => {
              setCategoryFilter(e.target.value as "all" | FeedbackCategory);
              setPage(1);
            }}
            className="h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900"
          >
            <option value="all">Tất cả phân loại</option>
            <option value="CONTENT">Nội dung học &amp; đề thi</option>
            <option value="SYSTEM_BUG">Lỗi hệ thống</option>
            <option value="TEACHING">Giảng dạy</option>
            <option value="FEATURE_REQUEST">Đề xuất tính năng</option>
            <option value="OTHER">Khác</option>
          </select>
        </div>

        <SearchInput
          id="admin-feedback-search"
          label="Tìm kiếm theo nội dung góp ý"
          placeholder="Tìm kiếm trong nội dung góp ý..."
          value={searchTerm}
          onChange={(next) => {
            setSearchTerm(next.trim());
            setPage(1);
          }}
        />
      </Toolbar>

      <QueryState
        isLoading={query.isLoading}
        isError={query.isError}
        error={query.error}
        isEmpty={items.length === 0}
        onRetry={() => void query.refetch()}
        loadingLabel="Đang tải danh sách góp ý..."
        emptyTitle="Chưa có góp ý nào phù hợp"
        emptyDescription="Thay đổi bộ lọc tìm kiếm hoặc chờ học viên gửi góp ý ẩn danh mới."
      >
        <ul className="space-y-4">
          {items.map((item) => (
            <li key={item.id}>
              <article className="lms-card space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <MetaTag variant="neutral">Ẩn danh</MetaTag>
                    <MetaTag variant="info">{CATEGORY_LABELS[item.category]}</MetaTag>
                    {item.rating !== null && item.rating !== undefined ? (
                      <MetaTag variant="warning">
                        <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-500" aria-hidden={true} />
                        {item.rating}/5 sao
                      </MetaTag>
                    ) : null}
                    <StatusBadge
                      status={STATUS_BADGE_MAP[item.status]}
                      labelOverride={STATUS_LABELS[item.status]}
                    />
                    <time
                      dateTime={item.createdAt}
                      className="text-xs text-slate-600"
                    >
                      {formatVnDateTime(item.createdAt)}
                    </time>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    className={buttonVariants({ variant: "secondary", size: "sm" })}
                  >
                    Cập nhật trạng thái
                  </button>
                </div>

                <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
                  {item.content}
                </p>

                {item.adminNote ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
                    <span className="font-semibold text-slate-900">Ghi chú quản trị: </span>
                    <span className="whitespace-pre-wrap">{item.adminNote}</span>
                  </div>
                ) : null}
              </article>
            </li>
          ))}
        </ul>

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
        open={Boolean(selectedItem)}
        onClose={() => setSelectedItem(null)}
        title="Xử lý góp ý ẩn danh"
      >
        {selectedItem ? (
          <TriageFeedbackForm
            key={selectedItem.id}
            item={selectedItem}
            onClose={() => setSelectedItem(null)}
            onUpdated={setNotice}
          />
        ) : null}
      </ModalDialog>
    </div>
  );
}
