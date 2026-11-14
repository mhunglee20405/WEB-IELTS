"use client";

import { ArrowLeft, Languages, Lock, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PageHeader, QueryState, StatusBadge } from "@/components/ui";
import { assignmentsApi, studentAssignmentsApi } from "@/lib/api/endpoints";
import { ApiError } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import { PASS_SCORE_THRESHOLD } from "@/lib/api/types";
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

  const summaryFallbackQuery = useQuery({
    queryKey: studentKeys.assignments("all", "all", 1),
    queryFn: () => assignmentsApi.listMine({ page: 1, limit: 100 }),
    enabled: isAnswerLocked,
  });

  const summary = summaryFallbackQuery.data?.items.find(
    (item) => item.studentAssignmentId === studentAssignmentId,
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Xem lại đáp án & giải thích"
        subtitle="Đáp án chuẩn chỉ được mở khóa sau khi bạn đạt từ 70% trở lên."
        actions={
          <Link
            href={`/student/assignments/${studentAssignmentId}`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Quay lại bài tập
          </Link>
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
              {summary?.bestScore !== null && summary?.bestScore !== undefined ? (
                <p className="text-sm font-semibold">
                  Điểm cao nhất hiện tại của bạn: {summary.bestScore}% (cần thêm{" "}
                  {Math.max(0, PASS_SCORE_THRESHOLD - summary.bestScore)}%).
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
                <Link
                  href={`/student/assignments/${studentAssignmentId}/translation`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  <Languages className="h-4 w-4" aria-hidden={true} />
                  Chuyển sang bài dịch (nếu là Reading)
                </Link>
              </div>

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
                        <h2 className="text-base font-semibold text-slate-900">
                          Câu {item.orderIndex}: {item.prompt}
                        </h2>
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
          ) : null}
        </QueryState>
      )}
    </div>
  );
}

