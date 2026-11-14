"use client";

import {
  ArrowLeft,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  Languages,
  Lock,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/auth/auth-provider";
import { QuestionRenderer } from "@/components/student/question-renderer";
import { ReadingSplitWorkspace } from "@/components/student/reading-split-workspace";
import { SignedAudioPlayer } from "@/components/student/signed-audio-player";
import {
  ConfirmDialog,
  PageHeader,
  QueryState,
  SafeHtml,
  StatusBadge,
} from "@/components/ui";
import { createIdempotencyKey } from "@/lib/api/client";
import { assignmentsApi, studentAssignmentsApi } from "@/lib/api/endpoints";
import { ApiError, getFriendlyErrorMessage } from "@/lib/api/error";
import { studentKeys } from "@/lib/api/query-keys";
import {
  PASS_SCORE_THRESHOLD,
  type StudentAssignmentDetail,
  type SubmissionHistoryItem,
  type SubmissionResult,
} from "@/lib/api/types";
import {
  clearExerciseDraft,
  loadExerciseDraft,
  saveExerciseDraft,
} from "@/lib/student/draft-storage";
import { useNowMs } from "@/lib/time/use-now";
import { formatDateKeyVi, formatVnDateTime, formatVnTime } from "@/lib/time/vn-time";

interface ExerciseRunnerProps {
  detail: StudentAssignmentDetail;
  userId: string;
  submissions: SubmissionHistoryItem[];
}

function ExerciseRunner({ detail, userId, submissions }: ExerciseRunnerProps) {
  const queryClient = useQueryClient();
  const [answers, setAnswers] = useState<Record<string, string>>(
    () => loadExerciseDraft(userId, detail.studentAssignmentId)?.answers ?? {},
  );
  const [draftSavedAt, setDraftSavedAt] = useState<string | null>(
    () => loadExerciseDraft(userId, detail.studentAssignmentId)?.updatedAt ?? null,
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [latestResult, setLatestResult] = useState<SubmissionResult | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    createIdempotencyKey(),
  );

  const totalQuestions = detail.exercise.questions.length;
  const answeredCount = detail.exercise.questions.filter(
    (q) => (answers[q.id] ?? "").trim().length > 0,
  ).length;
  const unansweredCount = Math.max(0, totalQuestions - answeredCount);

  const handleAnswerChange = (questionId: string, nextValue: string) => {
    const next = { ...answers, [questionId]: nextValue };
    setAnswers(next);
    const savedIso = saveExerciseDraft(userId, detail.studentAssignmentId, next);
    setDraftSavedAt(savedIso);
  };

  const handleClearDraft = () => {
    clearExerciseDraft(userId, detail.studentAssignmentId);
    setAnswers({});
    setDraftSavedAt(null);
  };

  const submitMutation = useMutation({
    mutationFn: () =>
      studentAssignmentsApi.submitAnswers(
        detail.studentAssignmentId,
        {
          answers: detail.exercise.questions.map((q) => ({
            questionId: q.id,
            value: (answers[q.id] ?? "").trim(),
          })),
        },
        idempotencyKey,
      ),
    onSuccess: async (result) => {
      setSubmitError(null);
      setLatestResult(result);
      setConfirmOpen(false);
      // Only rotate idempotency key after confirmed server scoring so failed requests retry idempotently
      setIdempotencyKey(createIdempotencyKey());
      if (result.passed) {
        clearExerciseDraft(userId, detail.studentAssignmentId);
        setDraftSavedAt(null);
      }
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: studentKeys.assignmentDetail(detail.studentAssignmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: studentKeys.assignmentSubmissions(detail.studentAssignmentId),
        }),
        queryClient.invalidateQueries({
          queryKey: studentKeys.assignments("all", "all", 1),
        }),
        queryClient.invalidateQueries({
          queryKey: studentKeys.dashboard,
        }),
      ]);
    },
    onError: (err) => {
      setConfirmOpen(false);
      setSubmitError(getFriendlyErrorMessage(err));
    },
  });

  const isReviewUnlocked =
    detail.answerReviewUnlocked || Boolean(latestResult?.answerReviewUnlocked);
  const isTranslationAvailable =
    detail.translationAvailable || Boolean(latestResult?.translationAvailable);
  const bestScore = latestResult?.bestScore ?? detail.bestScore;

  const questionsPanel = (
    <div className="space-y-4">
      <div className="lms-card space-y-2 border-slate-200 bg-slate-50/70">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-slate-900">
            Tiến độ trả lời: {answeredCount} / {totalQuestions} câu
          </p>
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
            {draftSavedAt ? (
              <span>Đã lưu nháp lúc {formatVnTime(draftSavedAt)}</span>
            ) : (
              <span>Chưa có bản nháp cục bộ</span>
            )}
            {answeredCount > 0 ? (
              <button
                type="button"
                onClick={handleClearDraft}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden={true} />
                Xóa nháp
              </button>
            ) : null}
          </div>
        </div>
        {detail.exercise.instructions ? (
          <p className="text-xs leading-relaxed text-slate-700">
            {detail.exercise.instructions}
          </p>
        ) : null}
      </div>

      {detail.exercise.questions.map((question) => (
        <QuestionRenderer
          key={question.id}
          question={question}
          value={answers[question.id] ?? ""}
          disabled={submitMutation.isPending}
          onChange={(nextVal) => handleAnswerChange(question.id, nextVal)}
        />
      ))}

      {submitError ? (
        <div
          role="alert"
          className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-950"
        >
          {submitError}
        </div>
      ) : null}

      <div className="lms-card lms-card-split">
        <div className="text-xs text-slate-600">
          <p className="font-semibold text-slate-900">
            Ngưỡng đạt mở khóa đáp án: {PASS_SCORE_THRESHOLD}%
          </p>
          <p>
            Hệ thống sử dụng mã định danh giao dịch chống trùng lặp để tránh tính hai lần
            nếu mạng chậm.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={submitMutation.isPending || totalQuestions === 0}
          className="inline-flex min-h-[48px] items-center justify-center gap-2 rounded-lg bg-blue-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Send className="h-4 w-4" aria-hidden={true} />
          {submitMutation.isPending ? "Đang chấm điểm..." : "Nộp bài"}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={detail.passed ? "passed" : detail.status} />
          <span className="text-slate-600">
            Hạn nộp:{" "}
            <strong className="font-semibold text-slate-900">
              {formatVnDateTime(detail.effectiveDueAt)}
            </strong>
          </span>
          {bestScore !== null ? (
            <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-800">
              Điểm cao nhất: {bestScore}%
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isReviewUnlocked ? (
            <Link
              href={`/student/assignments/${detail.studentAssignmentId}/review`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100"
            >
              <CheckCircle2 className="h-4 w-4" aria-hidden={true} />
              Xem đáp án chi tiết
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-600">
              <Lock className="h-3.5 w-3.5" aria-hidden={true} />
              Đạt &ge; {PASS_SCORE_THRESHOLD}% để mở đáp án
            </span>
          )}

          {isTranslationAvailable ? (
            <Link
              href={`/student/assignments/${detail.studentAssignmentId}/translation`}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-900 hover:bg-blue-100"
            >
              <Languages className="h-4 w-4" aria-hidden={true} />
              Làm bài dịch đối chiếu
            </Link>
          ) : null}
        </div>
      </div>

      {detail.examTestId ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50/70 px-4 py-3 text-sm">
          <div>
            <p className="font-bold text-blue-950">
              Bài tập sử dụng Phòng thi IELTS v2 (
              {detail.requiredScope === "PART" ? "Phạm vi: 1 Part chỉ định" : "Phạm vi: Full Test"})
            </p>
            <p className="text-xs text-blue-900">
              Mở bài trong giao diện CBT để có đồng hồ server, tự động lưu nháp và chấm 15 dạng câu hỏi IELTS.
            </p>
          </div>
          <Link
            href={`/student/practice/${encodeURIComponent(detail.examTestId)}?mode=${detail.requiredScope ?? "FULL"}${detail.requiredPartId ? `&partId=${encodeURIComponent(detail.requiredPartId)}` : ""}&studentAssignmentId=${encodeURIComponent(detail.studentAssignmentId)}`}
            className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700"
          >
            Mở Phòng thi CBT
          </Link>
        </div>
      ) : null}

      {latestResult ? (
        <section
          aria-live="polite"
          className={
            latestResult.passed
              ? "lms-card border-emerald-300 bg-emerald-50 text-emerald-950"
              : "lms-card border-amber-300 bg-amber-50 text-amber-950"
          }
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-base font-bold">
                <Award className="h-5 w-5" aria-hidden={true} />
                Lần nộp #{latestResult.attemptNo}: Đạt {latestResult.score}% (
                {latestResult.passed ? "ĐẠT" : "CHƯA ĐẠT"})
              </p>
              <p className="text-sm">
                {latestResult.passed
                  ? "Chúc mừng! Bạn đã mở khóa đáp án chi tiết và phần dịch đối chiếu (với bài Reading)."
                  : `Cần tối thiểu ${PASS_SCORE_THRESHOLD}% để mở khóa đáp án. Đáp án đúng vẫn được giữ bí mật để bạn tiếp tục luyện lại.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {latestResult.answerReviewUnlocked ? (
                <Link
                  href={`/student/assignments/${detail.studentAssignmentId}/review`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800"
                >
                  Mở đáp án chi tiết
                  <ArrowRight className="h-4 w-4" aria-hidden={true} />
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setLatestResult(null)}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-amber-400 bg-white px-4 py-2 text-sm font-semibold text-amber-950 hover:bg-amber-100"
                >
                  <RotateCcw className="h-4 w-4" aria-hidden={true} />
                  Tiếp tục sửa và làm lại
                </button>
              )}
              {latestResult.translationAvailable ? (
                <Link
                  href={`/student/assignments/${detail.studentAssignmentId}/translation`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
                >
                  <Languages className="h-4 w-4" aria-hidden={true} />
                  Làm bài dịch đối chiếu
                </Link>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

      {detail.exerciseType === "reading" ? (
        <ReadingSplitWorkspace
          leftLabel="Bài đọc"
          rightLabel={`Câu hỏi (${totalQuestions})`}
          leftTitle={detail.exercise.title}
          leftContent={
            <SafeHtml
              html={
                detail.exercise.passageHtml ?? "<p>Không có nội dung bài đọc.</p>"
              }
              lang="en"
              preset="richText"
            />
          }
          rightContent={questionsPanel}
        />
      ) : (
        <div className="space-y-6">
          {detail.exercise.audioAssetId ? (
            <SignedAudioPlayer
              assetId={detail.exercise.audioAssetId}
              title={detail.exercise.title}
            />
          ) : null}
          {questionsPanel}
        </div>
      )}

      <section aria-labelledby="submission-history-heading" className="space-y-3">
        <h2
          id="submission-history-heading"
          className="text-lg font-semibold text-slate-900"
        >
          Lịch sử các lần nộp ({submissions.length})
        </h2>
        {submissions.length === 0 ? (
          <div className="lms-card text-sm text-slate-600">
            Bạn chưa có lượt nộp nào cho bài tập này.
          </div>
        ) : (
          <div className="lms-table-wrapper">
            <table className="lms-table">
              <thead>
                <tr>
                  <th scope="col">Lần thử</th>
                  <th scope="col">Thời gian nộp (GMT+7)</th>
                  <th scope="col">Điểm số</th>
                  <th scope="col">Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {submissions.map((item) => (
                  <tr key={item.submissionId}>
                    <td className="font-semibold">#{item.attemptNo}</td>
                    <td>{formatVnDateTime(item.submittedAt)}</td>
                    <td className="font-semibold tabular-nums">{item.score}%</td>
                    <td>
                      <StatusBadge
                        status={item.passed ? "passed" : "submitted"}
                        labelOverride={
                          item.passed ? "Đạt (>=70%)" : "Chưa đạt"
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <ConfirmDialog
        open={confirmOpen}
        title="Xác nhận nộp bài chấm điểm?"
        description={
          <div className="space-y-2">
            <p>
              Bạn đã hoàn thành{" "}
              <strong>
                {answeredCount} / {totalQuestions}
              </strong>{" "}
              câu hỏi.
            </p>
            {unansweredCount > 0 ? (
              <p className="font-medium text-amber-800">
                Lưu ý: Vẫn còn {unansweredCount} câu chưa điền đáp án.
              </p>
            ) : null}
            <p>
              Hệ thống sẽ chấm tự động ngay sau khi xác nhận. Đạt từ{" "}
              {PASS_SCORE_THRESHOLD}% trở lên để mở khóa đáp án chi tiết.
            </p>
          </div>
        }
        confirmLabel="Nộp bài ngay"
        cancelLabel="Kiểm tra lại"
        lightDismiss={false}
        isSubmitting={submitMutation.isPending}
        onConfirm={() => submitMutation.mutate()}
        onClose={() => setConfirmOpen(false)}
      />
    </div>
  );
}

export default function StudentAssignmentWorkspacePage() {
  const params = useParams<{ studentAssignmentId: string }>();
  const studentAssignmentId = params.studentAssignmentId;
  const { user } = useAuth();
  const nowMs = useNowMs(30_000);

  const detailQuery = useQuery({
    queryKey: studentKeys.assignmentDetail(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.getDetail(studentAssignmentId),
    retry: (failureCount, error) => {
      if (error instanceof ApiError && (error.statusCode === 403 || error.statusCode === 404)) {
        return false;
      }
      return failureCount < 1;
    },
  });

  const isNotOpenError =
    detailQuery.isError &&
    detailQuery.error instanceof ApiError &&
    detailQuery.error.code === "ASSIGNMENT_NOT_OPEN_YET";

  const listFallbackQuery = useQuery({
    queryKey: studentKeys.assignments("all", "all", 1),
    queryFn: () => assignmentsApi.listMine({ page: 1, limit: 100 }),
    enabled: isNotOpenError,
  });

  const submissionsQuery = useQuery({
    queryKey: studentKeys.assignmentSubmissions(studentAssignmentId),
    queryFn: () => studentAssignmentsApi.listSubmissions(studentAssignmentId),
    enabled: Boolean(detailQuery.data),
  });

  const previewSummary = listFallbackQuery.data?.items.find(
    (item) => item.studentAssignmentId === studentAssignmentId,
  );

  const preOpenDetail =
    detailQuery.data &&
    new Date(detailQuery.data.openAt).getTime() > nowMs;

  return (
    <div className="space-y-6">
      <PageHeader
        title={detailQuery.data?.title ?? previewSummary?.title ?? "Làm bài tập IELTS"}
        subtitle={
          detailQuery.data
            ? `${detailQuery.data.courseTitle} · Ngày giao ${formatDateKeyVi(
                detailQuery.data.assignedDate,
              )}`
            : "Giao diện làm bài chuẩn hóa theo thời gian Asia/Ho_Chi_Minh."
        }
        actions={
          <Link
            href="/student/assignments"
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden={true} />
            Quay lại danh sách
          </Link>
        }
      />

      {isNotOpenError || preOpenDetail ? (
        <section
          aria-label="Bài tập chưa đến giờ mở"
          className="lms-card space-y-3 border-blue-300 bg-blue-50 text-blue-950"
        >
          <div className="flex items-start gap-3">
            <Lock className="mt-0.5 h-5 w-5 shrink-0 text-blue-700" aria-hidden={true} />
            <div className="space-y-1">
              <h2 className="text-lg font-bold">Bài tập chưa mở</h2>
              <p className="text-sm">
                Nội dung đề bài, câu hỏi và tệp âm thanh được bảo vệ tuyệt đối trước thời
                điểm mở bài.
              </p>
              {previewSummary ? (
                <p className="text-sm font-medium">
                  Thời gian mở dự kiến:{" "}
                  <strong>{formatVnDateTime(previewSummary.openAt)}</strong> · Hạn nộp:{" "}
                  <strong>{formatVnDateTime(previewSummary.effectiveDueAt)}</strong>
                </p>
              ) : null}
            </div>
          </div>
          <div>
            <Link
              href="/student/assignments"
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800"
            >
              <BookOpen className="h-4 w-4" aria-hidden={true} />
              Xem các bài tập đang mở khác
            </Link>
          </div>
        </section>
      ) : (
        <QueryState
          isLoading={detailQuery.isLoading}
          isError={detailQuery.isError}
          error={detailQuery.error}
          onRetry={() => void detailQuery.refetch()}
          loadingLabel="Đang tải nội dung bài tập..."
        >
          {detailQuery.data ? (
            <ExerciseRunner
              key={detailQuery.data.studentAssignmentId}
              detail={detailQuery.data}
              userId={user?.id ?? "guest"}
              submissions={submissionsQuery.data ?? []}
            />
          ) : null}
        </QueryState>
      )}
    </div>
  );
}
