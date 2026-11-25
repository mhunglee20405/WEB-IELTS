"use client";

import { ArrowLeft, CheckCircle2, Languages, Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, QueryState, SafeHtml, StatusBadge } from "@/components/ui";
import { assignmentsApi, studentAssignmentsApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import { PASS_SCORE_THRESHOLD } from "@/lib/api/types";
import { formatVnDateTime } from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

export default function StudentAssignmentReviewPage() {
  const params = useParams<{ studentAssignmentId: string }>();
  const studentAssignmentId = params.studentAssignmentId;

  const reviewQuery = useQuery({
    queryKey: studentKeys.assignmentReview(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.getReview(studentAssignmentId),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 404)) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const isAnswerLocked =
    reviewQuery.isError &&
    reviewQuery.error instanceof ApiError &&
    (reviewQuery.error.code === "ANSWER_LOCKED" ||
      reviewQuery.error.code === "ANSWER_REVIEW_LOCKED" ||
      reviewQuery.error.statusCode === 403);

  const detailQuery = useQuery({
    queryKey: studentKeys.assignmentDetail(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.getDetail(studentAssignmentId),
  });

  const summaryFallbackQuery = useQuery({
    queryKey: studentKeys.assignments("all", "all", 1),
    queryFn: () => assignmentsApi.listMine({ page: 1, limit: 100 }),
  });

  const summary = summaryFallbackQuery.data?.items.find(
    (item) => item.studentAssignmentId === studentAssignmentId,
  );

  const translationQuery = useQuery({
    queryKey: studentKeys.assignmentTranslation(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.getTranslation(studentAssignmentId),
    enabled: !isAnswerLocked,
  });

  const hasTranslation = Boolean(translationQuery.data?.draftText?.trim());
  const exType = detailQuery.data?.exerciseType || summary?.exerciseType;
  const isReading = !exType || String(exType).toLowerCase() === "reading";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xem lại đáp án & giải thích"
        subtitle="Đáp án chuẩn chỉ được mở khóa sau khi bạn đạt từ 70% trở lên."
        actions={
          !reviewQuery.isLoading && !isAnswerLocked ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={`/student/assignments/${studentAssignmentId}`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"
              >
                <RotateCcw className="h-4 w-4" aria-hidden={true} />
                Làm lại bài tập
              </Link>
              <Link
                href="/student/assignments"
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden={true} />
                Danh sách bài tập
              </Link>
            </div>
          ) : undefined
        }
      />

      {isAnswerLocked ? (
        <section
          aria-label="Đáp án đang khóa"
          className="lms-card space-y-4 border-amber-300 bg-amber-50 text-amber-950"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-6 w-6 shrink-0 text-amber-800" aria-hidden={true} />
            <div className="space-y-1.5">
              <h2 className="text-lg font-bold">Đáp án chưa được mở khóa</h2>
              <p className="text-sm">
                Bạn cần đạt tối thiểu <strong>{PASS_SCORE_THRESHOLD}%</strong> để xem đáp án
                đúng và giải thích chi tiết cho bài tập này.
              </p>
              {(detailQuery.data?.bestScore ?? summary?.bestScore) !== null &&
              (detailQuery.data?.bestScore ?? summary?.bestScore) !== undefined ? (
                <p className="text-sm font-semibold">
                  Điểm cao nhất hiện tại của bạn: {detailQuery.data?.bestScore ?? summary?.bestScore}% (cần thêm{" "}
                  {Math.max(0, PASS_SCORE_THRESHOLD - (detailQuery.data?.bestScore ?? summary?.bestScore ?? 0))}%).
                </p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/student/assignments/${studentAssignmentId}`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <RotateCcw className="h-4 w-4" aria-hidden={true} />
              Làm lại bài tập
            </Link>
            <Link
              href="/student/assignments"
              className="inline-flex min-h-[44px] items-center rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
            >
              Danh sách bài tập
            </Link>
          </div>
        </section>
      ) : (
        <QueryState
          isLoading={reviewQuery.isLoading}
          isError={reviewQuery.isError}
          error={reviewQuery.error}
          onRetry={() => void reviewQuery.refetch()}
          loadingLabel="Đang tải đáp án chi tiết..."
        >
          {reviewQuery.data ? (
            <div className="space-y-6">
              <div className="lms-card lms-card-split border-emerald-300 bg-emerald-50/70">
                <div className="flex flex-wrap items-center gap-3">
                  <StatusBadge status="passed" />
                  <p className="text-sm font-semibold text-emerald-950">
                    Điểm tốt nhất đã ghi nhận:{" "}
                    <span className="text-base font-bold tabular-nums">
                      {reviewQuery.data.score}%
                    </span>
                  </p>
                </div>
                {isReading ? (
                  <Link
                    href={`/student/assignments/${studentAssignmentId}/translation`}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                  >
                    <Languages className="h-4 w-4" aria-hidden={true} />
                    Mở phòng dịch đầy đủ
                  </Link>
                ) : null}
              </div>

              {/* Translation Review Section for Reading Exercises */}
              {isReading && translationQuery.data ? (
                hasTranslation ? (
                  <section
                    aria-label="Đoạn văn đã dịch của học viên"
                    className="lms-card space-y-4 border-indigo-200 bg-white shadow-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700">
                          <Languages className="h-5 w-5" aria-hidden={true} />
                        </span>
                        <div>
                          <h2 className="text-base font-bold text-slate-900">
                            Bài dịch tiếng Việt đã nộp của bạn
                          </h2>
                          <p className="text-xs text-slate-600">
                            {translationQuery.data.passageTitle || "Reading Passage"}
                            {translationQuery.data.submittedAt
                              ? ` · Nộp lúc: ${formatVnDateTime(translationQuery.data.submittedAt)}`
                              : ""}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={translationQuery.data.status} />
                        <Link
                          href={`/student/assignments/${studentAssignmentId}/translation`}
                          className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                        >
                          Chỉnh sửa bản dịch &rarr;
                        </Link>
                      </div>
                    </div>

                    {translationQuery.data.teacherFeedback ? (
                      <div className="rounded-lg border border-blue-200 bg-blue-50/80 p-3.5 text-sm text-blue-950 space-y-1">
                        <p className="flex items-center gap-1.5 font-bold text-blue-900">
                          <CheckCircle2 className="h-4 w-4 text-blue-700" aria-hidden={true} />
                          Nhận xét từ giáo viên:
                        </p>
                        <p className="whitespace-pre-wrap text-xs leading-relaxed text-blue-900">
                          {translationQuery.data.teacherFeedback}
                        </p>
                        {translationQuery.data.reviewedAt ? (
                          <p className="text-[11px] text-blue-700">
                            Thời gian chấm: {formatVnDateTime(translationQuery.data.reviewedAt)}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div className="grid gap-4 lg:grid-cols-2">
                      <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
                        <h3 className="border-b border-slate-200 pb-2 text-sm font-bold text-slate-900">
                          Bài đọc gốc tiếng Anh
                        </h3>
                        <div className="prose prose-sm max-h-[360px] max-w-none overflow-y-auto pr-2 leading-relaxed text-slate-800">
                          <SafeHtml
                            html={
                              translationQuery.data.passageHtml ||
                              "<p>Nội dung đoạn văn gốc đang được cập nhật...</p>"
                            }
                            lang="en"
                            preset="richText"
                          />
                        </div>
                      </div>

                      <div className="space-y-2 rounded-xl border border-indigo-200 bg-indigo-50/30 p-4">
                        <h3 className="border-b border-indigo-200/60 pb-2 text-sm font-bold text-indigo-950">
                          Bản dịch tiếng Việt đã nộp
                        </h3>
                        <div className="max-h-[360px] overflow-y-auto whitespace-pre-wrap pr-2 text-sm leading-relaxed text-slate-900">
                          {translationQuery.data.draftText}
                        </div>
                      </div>
                    </div>
                  </section>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/60 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-100 text-blue-700">
                        <Languages className="h-5 w-5" aria-hidden={true} />
                      </span>
                      <div>
                        <p className="text-sm font-bold text-blue-950">
                          Bài dịch đối chiếu Reading
                        </p>
                        <p className="text-xs text-blue-800">
                          Bạn chưa nộp bài dịch tiếng Việt cho bài đọc này.
                        </p>
                      </div>
                    </div>
                    <Link
                      href={`/student/assignments/${studentAssignmentId}/translation`}
                      className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                    >
                      <Languages className="h-3.5 w-3.5" aria-hidden={true} />
                      Làm bài dịch ngay &rarr;
                    </Link>
                  </div>
                )
              ) : null}

              <div className="space-y-3">
                <h2 className="text-base font-bold text-slate-900">
                  Chi tiết từng câu hỏi &amp; đáp án đúng
                </h2>
                <ol className="space-y-4">
                  {reviewQuery.data.items.map((item) => (
                    <li key={item.questionId}>
                      <article
                        className={cn(
                          "lms-card space-y-3",
                          item.isCorrect ? "border-emerald-200" : "border-red-200",
                        )}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <h3 className="text-base font-semibold text-slate-900">
                            Câu {item.orderIndex}: {item.prompt}
                          </h3>
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
                              item.isCorrect
                                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                                : "border-red-300 bg-red-50 text-red-900",
                            )}
                          >
                            <span
                              className={cn(
                                "h-2 w-2 shrink-0 rounded-full",
                                item.isCorrect ? "bg-emerald-700" : "bg-red-700",
                              )}
                              aria-hidden={true}
                            />
                            {item.isCorrect ? "Chính xác" : "Chưa chính xác"}
                          </span>
                        </div>

                        <dl className="grid gap-3 rounded-lg bg-slate-50 p-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-xs font-medium text-slate-600">
                              Câu trả lời của bạn
                            </dt>
                            <dd
                              className={cn(
                                "mt-0.5 font-semibold",
                                item.isCorrect ? "text-emerald-900" : "text-red-800",
                              )}
                            >
                              {item.studentAnswer || "— (Bỏ trống)"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-xs font-medium text-slate-600">
                              Đáp án chuẩn
                            </dt>
                            <dd className="mt-0.5 font-bold text-emerald-900">
                              {item.correctAnswer}
                            </dd>
                          </div>
                        </dl>

                        {item.explanation ? (
                          <div className="rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-700">
                            <span className="font-semibold text-slate-900">Giải thích: </span>
                            {item.explanation}
                          </div>
                        ) : null}
                      </article>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          ) : null}
        </QueryState>
      )}
    </div>
  );
}

