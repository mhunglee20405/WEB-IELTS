"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, CheckCircle2, Lock, MessageSquare, Save, Send } from "lucide-react";
import { Badge, Button, Card, PageHeader, QueryState, SafeHtml } from "@/components/ui";
import { readingTranslationsApi } from "@/lib/api/endpoints";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import { countWords } from "@/lib/exam/question-meta";
import { cn } from "@/lib/utils/cn";

export default function StudentReadingTranslationWorkspacePage() {
  const params = useParams<{ testId: string; passageId: string }>();
  const queryClient = useQueryClient();
  const testId = decodeURIComponent(params.testId);
  const passageId = decodeURIComponent(params.passageId);

  const [draftOverride, setDraftOverride] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const eligibilityQuery = useQuery({
    queryKey: examKeys.translationEligibility(testId),
    queryFn: () => readingTranslationsApi.getEligibility(testId),
  });

  const detailQuery = useQuery({
    queryKey: examKeys.translationPassage(passageId),
    queryFn: () => readingTranslationsApi.getPassage(passageId),
    retry: (count, error) => {
      if (error instanceof ApiError && error.statusCode === 403) return false;
      return count < 1;
    },
  });

  const detail = detailQuery.data;
  const textVi = draftOverride ?? detail?.textVi ?? "";
  const setTextVi = (next: string) => setDraftOverride(next);

  const isLockedSubmitted =
    detail?.status === "SUBMITTED" || detail?.status === "REVIEWED";

  const saveDraftMutation = useMutation({
    mutationFn: () =>
      readingTranslationsApi.saveDraft(passageId, {
        textVi,
        revision: detail?.revision ?? 1,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(examKeys.translationPassage(passageId), updated);
      void queryClient.invalidateQueries({
        queryKey: examKeys.translationEligibility(testId),
      });
      setNotice("Đã lưu bản nháp tiếng Việt trên máy chủ.");
    },
  });

  const submitMutation = useMutation({
    mutationFn: () =>
      readingTranslationsApi.submit(passageId, {
        textVi,
        revision: detail?.revision,
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(examKeys.translationPassage(passageId), updated);
      void queryClient.invalidateQueries({
        queryKey: examKeys.translationEligibility(testId),
      });
      setNotice("Đã nộp bài dịch thành công. Giảng viên sẽ xem xét và phản hồi.");
    },
  });

  const is403Locked =
    detailQuery.error instanceof ApiError && detailQuery.error.statusCode === 403;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          href={`/student/practice/${encodeURIComponent(testId)}`}
          className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Quay lại đề Reading
        </Link>
      </div>

      <PageHeader
        title="Không gian dịch bài đọc IELTS Reading"
        subtitle="Hoàn thiện bản dịch tiếng Việt cho các Passage bạn đã đạt tối thiểu 70%."
      />

      {/* Dynamic Multi-Passage Selector from Backend Eligibility */}
      {eligibilityQuery.data && (
        <div
          role="navigation"
          aria-label="Chọn Passage dịch"
          className="flex flex-wrap gap-2 rounded-xl border border-slate-200 bg-white p-3"
        >
          {eligibilityQuery.data.passages.map((p) => {
            const active = p.passageId === passageId;
            return p.eligible ? (
              <Link
                key={p.passageId}
                href={`/student/reading/${encodeURIComponent(testId)}/translate/${encodeURIComponent(p.passageId)}`}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors",
                  active
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-200 bg-slate-50 text-slate-800 hover:bg-slate-100",
                )}
              >
                <span>Passage {p.partNumber}</span>
                <Badge variant={active ? "neutral" : p.status === "REVIEWED" ? "success" : "info"}>
                  {p.status}
                </Badge>
              </Link>
            ) : (
              <span
                key={p.passageId}
                aria-disabled="true"
                title={p.lockReason ?? "Chưa đủ 70% để mở khóa dịch"}
                className="inline-flex min-h-10 cursor-not-allowed items-center gap-2 rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-500"
              >
                <Lock className="h-3.5 w-3.5" />
                <span>Passage {p.partNumber} (Khóa)</span>
              </span>
            );
          })}
        </div>
      )}

      {is403Locked ? (
        <Card className="border-amber-200 bg-amber-50/50 text-center">
          <div className="mx-auto flex max-w-md flex-col items-center py-6">
            <Lock className="h-9 w-9 text-amber-600" />
            <h2 className="mt-3 text-base font-bold text-slate-900">
              Passage này chưa được mở khóa luyện dịch
            </h2>
            <p className="mt-1.5 text-sm text-slate-700">
              Bạn cần hoàn thành bài đọc Passage này hoặc Full Test với số điểm từ 70% trở lên để mở khóa trình biên tập dịch.
            </p>
            <Link
              href={`/student/practice/${encodeURIComponent(testId)}`}
              className="mt-4 inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Luyện bài Reading ngay
            </Link>
          </div>
        </Card>
      ) : (
        <QueryState
          isLoading={detailQuery.isLoading}
          isError={detailQuery.isError}
          error={detailQuery.error}
          isEmpty={!detail}
          emptyTitle="Không tìm thấy dữ liệu bài dịch"
          emptyDescription="Passage không tồn tại trong hệ thống."
          onRetry={() => void detailQuery.refetch()}
        >
          {detail && (
            <div className="grid gap-5 lg:grid-cols-2">
              {/* Left: Source Reading Passage */}
              <Card className="space-y-4 lg:max-h-[75vh] lg:overflow-y-auto">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div>
                    <p className="text-xs font-bold text-blue-700 uppercase">
                      Passage {detail.partNumber} — Văn bản gốc
                    </p>
                    <h2 className="text-base font-bold text-slate-900">
                      {detail.passageTitle}
                    </h2>
                  </div>
                  <Badge variant="neutral">Bản dịch #{detail.revision}</Badge>
                </div>

                {detail.paragraphs && detail.paragraphs.length > 0 ? (
                  <div className="space-y-4 text-[15px] leading-7 text-slate-800">
                    {detail.paragraphs.map((p) => (
                      <div key={p.label} className="flex items-start gap-2.5">
                        <span className="mt-1 inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded bg-slate-100 px-1.5 text-xs font-bold text-slate-700">
                          {p.label}
                        </span>
                        <p className="flex-1">{p.text}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SafeHtml
                    html={detail.passageHtml}
                    preset="richText"
                    className="text-[15px] leading-7 text-slate-800"
                  />
                )}
              </Card>

              {/* Right: Vietnamese Editor & Teacher Feedback */}
              <div className="space-y-4">
                <Card className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-bold text-slate-900">
                      Bản dịch tiếng Việt của bạn
                    </h2>
                    <Badge
                      variant={
                        detail.status === "REVIEWED"
                          ? "success"
                          : detail.status === "SUBMITTED"
                            ? "info"
                            : "warning"
                      }
                    >
                      {detail.status === "REVIEWED"
                        ? "Đã chấm"
                        : detail.status === "SUBMITTED"
                          ? "Đã nộp chờ duyệt"
                          : "Bản nháp"}
                    </Badge>
                  </div>

                  <label htmlFor="translation-vi-editor" className="sr-only">
                    Nội dung dịch tiếng Việt
                  </label>
                  <textarea
                    id="translation-vi-editor"
                    rows={12}
                    disabled={isLockedSubmitted}
                    value={textVi}
                    onChange={(e) => setTextVi(e.target.value)}
                    placeholder="Dịch trung thực ý nghĩa học thuật của các đoạn văn sang tiếng Việt mạch lạc..."
                    className="lms-input w-full rounded-xl border border-slate-300 bg-white p-3.5 text-sm leading-relaxed text-slate-900 disabled:bg-slate-100 disabled:text-slate-600"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                    <span>Số từ: {countWords(textVi)} từ</span>
                    {detail.updatedAt && (
                      <span>
                        Cập nhật lần cuối:{" "}
                        {new Date(detail.updatedAt).toLocaleString("vi-VN")}
                      </span>
                    )}
                  </div>

                  {notice && (
                    <div
                      role="status"
                      aria-live="polite"
                      className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-800"
                    >
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      <span>{notice}</span>
                    </div>
                  )}

                  {(saveDraftMutation.isError || submitMutation.isError) && (
                    <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800">
                      {getFriendlyErrorMessage(
                        saveDraftMutation.error ?? submitMutation.error,
                      )}
                    </div>
                  )}

                  {!isLockedSubmitted && (
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="secondary"
                        loading={saveDraftMutation.isPending}
                        disabled={textVi.trim().length < 10}
                        onClick={() => void saveDraftMutation.mutateAsync()}
                      >
                        <Save className="h-4 w-4" />
                        Lưu nháp
                      </Button>
                      <Button
                        variant="primary"
                        loading={submitMutation.isPending}
                        disabled={textVi.trim().length < 10}
                        onClick={() => void submitMutation.mutateAsync()}
                        data-testid="translation-submit-btn"
                      >
                        <Send className="h-4 w-4" />
                        Nộp bản dịch
                      </Button>
                    </div>
                  )}
                </Card>

                {detail.teacherFeedback && (
                  <Card className="border-emerald-200 bg-emerald-50/40">
                    <div className="flex items-center gap-2 text-sm font-bold text-emerald-950">
                      <MessageSquare className="h-4 w-4 text-emerald-700" />
                      Nhận xét của Giảng viên
                    </div>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-800">
                      {detail.teacherFeedback}
                    </p>
                    {detail.reviewedBy && (
                      <p className="mt-2 text-xs text-slate-500">
                        Người chấm: {detail.reviewedBy}
                      </p>
                    )}
                  </Card>
                )}
              </div>
            </div>
          )}
        </QueryState>
      )}
    </div>
  );
}
