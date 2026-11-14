"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, CheckCircle2, Clock3, RotateCcw, User } from "lucide-react";
import { ReadingSplitWorkspace } from "@/components/student/reading-split-workspace";
import {
  Button,
  Card,
  MetaTag,
  PageHeader,
  QueryState,
  SafeHtml,
  StatusBadge,
  TabPanel,
  Tabs,
  Toolbar,
  type TabItem,
} from "@/components/ui";
import { readingTranslationsApi, studentAssignmentsApi } from "@/lib/api/endpoints";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys, teacherKeys } from "@/lib/api/query-keys";
import { ReadingTranslationReviewSchema, TranslationReviewFormSchema } from "@/lib/api/schemas";
import type { TeacherReadingTranslationItem } from "@/lib/api/types";
import {
  fetchTeacherTranslationQueue,
  type TranslationQueueItem,
} from "@/lib/teacher/data-helpers";
import { formatVnDateTime } from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

type QueueFilter = "pending" | "all";

const FILTER_TABS: readonly TabItem<QueueFilter>[] = [
  { id: "pending", label: "Chờ chấm" },
  { id: "all", label: "Tất cả bài dịch" },
];

function TranslationReviewPane({
  item,
  onReviewed,
}: {
  item: TranslationQueueItem;
  onReviewed: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<"approved" | "needs_revision">(() =>
    item.workspace.status === "needs_revision" ? "needs_revision" : "approved",
  );
  const [feedbackText, setFeedbackText] = useState(
    () => item.workspace.teacherFeedback ?? "",
  );
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: (payload: { decision: "approved" | "needs_revision"; feedback: string }) =>
      studentAssignmentsApi.reviewTranslation(item.workspace.translationId, payload),
    onSuccess: async (_updated, vars) => {
      await queryClient.invalidateQueries({ queryKey: teacherKeys.translationsQueue });
      await queryClient.invalidateQueries({ queryKey: teacherKeys.dashboard });
      onReviewed(
        vars.decision === "approved"
          ? `Đã chấm Đạt cho bản dịch của ${item.summary.studentName ?? "học viên"}.`
          : `Đã trả bản dịch yêu cầu sửa lại cho ${item.summary.studentName ?? "học viên"}.`,
      );
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = TranslationReviewFormSchema.safeParse({
      decision,
      feedback: feedbackText,
    });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Nhận xét chưa hợp lệ.");
      return;
    }
    setFieldError(null);
    reviewMutation.mutate(parsed.data);
  };

  return (
    <div className="space-y-4">
      {/* Persistent submission metadata header spanning full comparison width */}
      <Card as="section" aria-label="Thông tin học viên và bài nộp" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 text-slate-700"
              aria-hidden={true}
            >
              <User className="h-5 w-5" />
            </span>
            <div className="space-y-0.5">
              <p className="text-base font-semibold text-slate-950">
                Học viên: {item.summary.studentName ?? item.summary.studentId}
              </p>
              <p className="text-sm text-slate-700">{item.summary.title}</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {item.workspace.submittedAt ? (
              <MetaTag variant="neutral">
                <Clock3 className="h-3.5 w-3.5 text-slate-600" aria-hidden={true} />
                Nộp lúc: {formatVnDateTime(item.workspace.submittedAt)}
              </MetaTag>
            ) : null}
            <StatusBadge status={item.workspace.status} />
          </div>
        </div>
      </Card>

      {/* Balanced side-by-side split comparison: Original Passage vs Student Translation */}
      <ReadingSplitWorkspace
        leftLabel="Bài đọc gốc"
        rightLabel="Bản dịch học viên"
        leftTitle={item.workspace.passageTitle}
        leftContent={
          <div className="prose prose-sm max-w-none text-slate-800">
            <SafeHtml html={item.workspace.passageHtml} lang="en" preset="richText" />
          </div>
        }
        rightContent={
          <section
            aria-label="Bản dịch tiếng Việt của học viên"
            className="lms-card gap-3 lg:min-h-[260px]"
          >
            <h2 className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
              Bản dịch tiếng Việt của học viên
            </h2>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
              {item.workspace.draftText || "(Học viên chưa nhập nội dung dịch)"}
            </div>
          </section>
        }
      />

      {/* Docked full-width evaluation bar directly beneath the split comparison */}
      <form onSubmit={handleSubmit} noValidate className="lms-card gap-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/80 pb-3">
          <h2 className="text-base font-semibold text-slate-950">Đánh giá bản dịch</h2>
          <p className="text-xs font-medium text-slate-700">
            Kết luận và nhận xét sẽ gửi trực tiếp đến học viên sau khi lưu.
          </p>
        </div>

        {reviewMutation.isError ? (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden={true} />
            <span>{getFriendlyErrorMessage(reviewMutation.error)}</span>
          </div>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-[minmax(260px,340px)_1fr] lg:items-start">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">Kết luận chấm bài</legend>
            <div className="grid gap-2">
              <label className="lms-choice-label">
                <input
                  type="radio"
                  name={`decision-${item.workspace.translationId}`}
                  value="approved"
                  checked={decision === "approved"}
                  onChange={() => setDecision("approved")}
                />
                <span className="text-sm font-medium text-emerald-900">
                  Đạt yêu cầu (Approved)
                </span>
              </label>

              <label className="lms-choice-label">
                <input
                  type="radio"
                  name={`decision-${item.workspace.translationId}`}
                  value="needs_revision"
                  checked={decision === "needs_revision"}
                  onChange={() => setDecision("needs_revision")}
                />
                <span className="text-sm font-medium text-amber-900">
                  Cần sửa lại (Needs revision)
                </span>
              </label>
            </div>
          </fieldset>

          <div className="space-y-3">
            <div>
              <label
                htmlFor="tr-feedback"
                className="block text-sm font-medium text-slate-900"
              >
                Nhận xét sửa lỗi từ vựng / ngữ pháp <span className="text-red-700">*</span>
              </label>
              <textarea
                id="tr-feedback"
                rows={3}
                value={feedbackText}
                onChange={(e) => {
                  setFeedbackText(e.target.value);
                  setFieldError(null);
                }}
                aria-invalid={Boolean(fieldError)}
                aria-describedby={fieldError ? "tr-feedback-err" : undefined}
                placeholder="Nhận xét các cụm thuật ngữ chuyên ngành cần trau chuốt hoặc câu dịch tốt..."
                className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950 placeholder:text-slate-600"
              />
              {fieldError ? (
                <p id="tr-feedback-err" className="mt-1 text-xs font-medium text-red-700">
                  {fieldError}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end">
              <Button
                type="submit"
                variant="primary"
                disabled={reviewMutation.isPending}
              >
                {decision === "approved" ? (
                  <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
                ) : (
                  <RotateCcw className="h-4 w-4" aria-hidden={true} />
                )}
                {reviewMutation.isPending ? "Đang lưu đánh giá..." : "Gửi kết quả chấm dịch"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

function PassageTranslationReviewPane({
  item,
  onReviewed,
}: {
  item: TeacherReadingTranslationItem;
  onReviewed: (message: string) => void;
}) {
  const queryClient = useQueryClient();
  const [decision, setDecision] = useState<"REVIEWED" | "NEEDS_REVISION">("REVIEWED");
  const [feedback, setFeedback] = useState(item.teacherFeedback ?? "");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: (payload: { decision: "REVIEWED" | "NEEDS_REVISION"; feedback: string }) =>
      readingTranslationsApi.reviewTranslation(item.translationId, payload),
    onSuccess: async (_updated, vars) => {
      await queryClient.invalidateQueries({ queryKey: examKeys.teacherTranslationsRoot });
      onReviewed(
        vars.decision === "REVIEWED"
          ? `Đã chấm hoàn tất Passage ${item.partNumber} của ${item.studentName}.`
          : `Đã trả lại bản dịch Passage ${item.partNumber} để ${item.studentName} chỉnh sửa.`,
      );
    },
  });

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = ReadingTranslationReviewSchema.safeParse({ decision, feedback });
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? "Nhận xét chưa hợp lệ.");
      return;
    }
    setFieldError(null);
    reviewMutation.mutate(parsed.data);
  };

  return (
    <div className="space-y-4">
      <Card as="section" aria-label="Thông tin bài dịch theo Passage" className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-base font-semibold text-slate-950">
              Học viên: {item.studentName}
            </p>
            <p className="text-sm text-slate-700">
              {item.testTitle} · Passage {item.partNumber}: {item.passageTitle}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {item.submittedAt && (
              <MetaTag variant="neutral">
                <Clock3 className="h-3.5 w-3.5 text-slate-600" aria-hidden={true} />
                Nộp lúc: {formatVnDateTime(item.submittedAt)}
              </MetaTag>
            )}
            <StatusBadge
              status={item.status === "REVIEWED" ? "approved" : "submitted"}
              labelOverride={item.status}
            />
          </div>
        </div>
      </Card>

      <ReadingSplitWorkspace
        leftLabel="Bài đọc gốc (Passage)"
        rightLabel="Bản dịch tiếng Việt học viên"
        leftTitle={`Passage ${item.partNumber}: ${item.passageTitle}`}
        leftContent={
          item.paragraphs && item.paragraphs.length > 0 ? (
            <div className="space-y-3 text-sm leading-relaxed text-slate-800">
              {item.paragraphs.map((p) => (
                <p key={p.label}>
                  <strong>[{p.label}]</strong> {p.text}
                </p>
              ))}
            </div>
          ) : (
            <SafeHtml html={item.passageHtml} lang="en" preset="richText" />
          )
        }
        rightContent={
          <section className="lms-card gap-3 lg:min-h-[240px]">
            <h2 className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
              Bản dịch tiếng Việt của học viên
            </h2>
            <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-900">
              {item.textVi || "(Chưa có nội dung)"}
            </div>
          </section>
        }
      />

      <form onSubmit={handleSubmit} noValidate className="lms-card gap-4">
        <h2 className="text-base font-semibold text-slate-950">
          Chấm bài dịch theo Passage
        </h2>
        {reviewMutation.isError && (
          <div role="alert" className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900">
            {getFriendlyErrorMessage(reviewMutation.error)}
          </div>
        )}
        <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-slate-900">Quyết định</legend>
            <label className="lms-choice-label">
              <input
                type="radio"
                name={`v2-decision-${item.translationId}`}
                value="REVIEWED"
                checked={decision === "REVIEWED"}
                onChange={() => setDecision("REVIEWED")}
              />
              <span className="text-sm font-medium text-emerald-900">
                Đạt &amp; Hoàn tất (REVIEWED)
              </span>
            </label>
            <label className="lms-choice-label">
              <input
                type="radio"
                name={`v2-decision-${item.translationId}`}
                value="NEEDS_REVISION"
                checked={decision === "NEEDS_REVISION"}
                onChange={() => setDecision("NEEDS_REVISION")}
              />
              <span className="text-sm font-medium text-amber-900">
                Yêu cầu sửa thêm
              </span>
            </label>
          </fieldset>

          <div className="space-y-3">
            <label htmlFor="v2-tr-feedback" className="block text-sm font-medium text-slate-900">
              Nhận xét cho học viên <span className="text-red-700">*</span>
            </label>
            <textarea
              id="v2-tr-feedback"
              rows={3}
              value={feedback}
              onChange={(e) => {
                setFeedback(e.target.value);
                setFieldError(null);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm text-slate-950"
            />
            {fieldError && (
              <p className="text-xs font-medium text-red-700">{fieldError}</p>
            )}
            <div className="flex justify-end">
              <Button type="submit" variant="primary" disabled={reviewMutation.isPending}>
                <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
                {reviewMutation.isPending ? "Đang lưu..." : "Lưu nhận xét Passage"}
              </Button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function TeacherTranslationsPage() {
  const tabsPrefix = useId();
  const [sourceMode, setSourceMode] = useState<"course" | "passage">("course");
  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [selectedSaId, setSelectedSaId] = useState<string | null>(null);
  const [selectedPassageTransId, setSelectedPassageTransId] = useState<string | null>(null);
  const [bannerFeedback, setBannerFeedback] = useState<string | null>(null);

  const query = useQuery({
    queryKey: teacherKeys.translationsQueue,
    queryFn: () => fetchTeacherTranslationQueue(),
  });

  const passageQueueQuery = useQuery({
    queryKey: examKeys.teacherTranslationsList(
      filter === "pending" ? "SUBMITTED" : undefined,
      undefined,
    ),
    queryFn: () =>
      readingTranslationsApi.listTeacherQueue({
        status: filter === "pending" ? "SUBMITTED" : undefined,
        limit: 50,
      }),
  });

  const passageItems = useMemo(
    () => passageQueueQuery.data?.items ?? [],
    [passageQueueQuery.data?.items],
  );
  const activePassageItem =
    passageItems.find((p) => p.translationId === selectedPassageTransId) ??
    passageItems[0] ??
    null;

  const allItems = useMemo(() => query.data ?? [], [query.data]);
  const visibleItems = useMemo(
    () =>
      filter === "pending"
        ? allItems.filter((item) => item.workspace.status === "submitted")
        : allItems,
    [allItems, filter],
  );

  const activeItem =
    visibleItems.find((item) => item.summary.studentAssignmentId === selectedSaId) ??
    visibleItems[0] ??
    null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Chấm bài dịch Reading"
        subtitle="Đối chiếu đoạn văn gốc và bản dịch tiếng Việt của học viên đạt ngưỡng Reading (>=70%)."
        actions={
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-1 text-xs font-semibold">
            <button
              type="button"
              onClick={() => setSourceMode("course")}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                sourceMode === "course"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              Theo Bài tập khóa học ({visibleItems.length})
            </button>
            <button
              type="button"
              data-testid="switch-v2-passage-translations"
              onClick={() => setSourceMode("passage")}
              className={cn(
                "rounded-md px-3 py-1.5 transition-colors",
                sourceMode === "passage"
                  ? "bg-white text-blue-700 shadow-xs"
                  : "text-slate-600 hover:text-slate-900",
              )}
            >
              Theo Passage IELTS v2 ({passageItems.length})
            </button>
          </div>
        }
      />

      <Toolbar
        tabs={
          <Tabs
            idPrefix={tabsPrefix}
            ariaLabel="Lọc hàng chờ bài dịch"
            items={FILTER_TABS}
            value={filter}
            onChange={setFilter}
          />
        }
      >
        {visibleItems.length > 0 ? (
          <MetaTag variant="neutral">
            Hàng chờ: {visibleItems.length} bài dịch
          </MetaTag>
        ) : null}
      </Toolbar>

      {bannerFeedback ? (
        <div
          role="status"
          className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-sm font-medium text-emerald-900"
        >
          <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden={true} />
          <span>{bannerFeedback}</span>
        </div>
      ) : null}

      <TabPanel idPrefix={tabsPrefix} value={filter} activeValue={filter}>
        {sourceMode === "passage" ? (
          <QueryState
            isLoading={passageQueueQuery.isLoading}
            isError={passageQueueQuery.isError}
            error={passageQueueQuery.error}
            isEmpty={
              !passageQueueQuery.isLoading &&
              !passageQueueQuery.isError &&
              passageItems.length === 0
            }
            onRetry={() => void passageQueueQuery.refetch()}
            loadingLabel="Đang tải hàng chờ dịch Passage..."
            emptyTitle="Chưa có bài dịch Passage nào"
            emptyDescription="Các bản dịch được học viên nộp từ thư viện đề IELTS v2 sau khi đạt ≥ 70% sẽ hiển thị tại đây."
          >
            <div className="space-y-4">
              {passageItems.length > 1 ? (
                <ul className="lms-queue-grid list-none p-0">
                  {passageItems.map((entry) => {
                    const isSelected =
                      activePassageItem?.translationId === entry.translationId;
                    return (
                      <li key={entry.translationId} className="flex">
                        <button
                          type="button"
                          onClick={() => setSelectedPassageTransId(entry.translationId)}
                          className={cn(
                            "flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors",
                            isSelected
                              ? "border-blue-600 bg-blue-50/75 ring-1 ring-blue-600"
                              : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                          )}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-950">
                              {entry.studentName}
                            </span>
                            <StatusBadge
                              status={entry.status === "REVIEWED" ? "approved" : "submitted"}
                              labelOverride={entry.status}
                            />
                          </div>
                          <p className="text-xs font-medium text-slate-700">
                            {entry.testTitle} · Passage {entry.partNumber}
                          </p>
                          <p className="truncate text-xs text-slate-600">
                            {entry.passageTitle}
                          </p>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
              {activePassageItem ? (
                <PassageTranslationReviewPane
                  key={activePassageItem.translationId}
                  item={activePassageItem}
                  onReviewed={(msg) => setBannerFeedback(msg)}
                />
              ) : null}
            </div>
          </QueryState>
        ) : (
          <QueryState
            isLoading={query.isLoading}
            isError={query.isError}
            error={query.error}
            isEmpty={!query.isLoading && !query.isError && visibleItems.length === 0}
            onRetry={() => void query.refetch()}
            loadingLabel="Đang tải danh sách bài dịch..."
            emptyTitle={
              filter === "pending" ? "Chưa có bài dịch nào chờ chấm" : "Chưa có bài dịch nào"
            }
            emptyDescription="Các bản dịch được học viên nộp sau khi đạt >=70% bài Reading sẽ xuất hiện tại đây."
          >
          <div className="space-y-4">
            {visibleItems.length > 1 ? (
              <ul
                aria-label="Danh sách bài dịch trong hàng chờ"
                className="lms-queue-grid list-none p-0"
              >
                {visibleItems.map((entry) => {
                  const isSelected =
                    activeItem?.summary.studentAssignmentId === entry.summary.studentAssignmentId;
                  return (
                    <li key={entry.workspace.translationId} className="flex">
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedSaId(entry.summary.studentAssignmentId)
                        }
                        aria-pressed={isSelected}
                        className={cn(
                          "flex w-full flex-col gap-1.5 rounded-xl border p-3.5 text-left transition-colors",
                          isSelected
                            ? "border-blue-600 bg-blue-50/75 ring-1 ring-blue-600"
                            : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-950">
                            {entry.summary.studentName ?? entry.summary.studentId}
                          </span>
                          <StatusBadge status={entry.workspace.status} />
                        </div>
                        <p className="text-xs font-medium text-slate-700">
                          {entry.summary.title}
                        </p>
                        <p className="truncate text-xs text-slate-700">
                          {entry.workspace.passageTitle}
                        </p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}

            {activeItem ? (
              <TranslationReviewPane
                key={`${activeItem.workspace.translationId}-${activeItem.workspace.status}`}
                item={activeItem}
                onReviewed={(msg) => setBannerFeedback(msg)}
              />
            ) : null}
          </div>
        </QueryState>
        )}
      </TabPanel>
    </div>
  );
}
