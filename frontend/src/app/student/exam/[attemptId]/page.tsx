"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle } from "lucide-react";
import {
  AutosaveIndicator,
  ExamHeader,
  ExamProgress,
  ExamShell,
  ExamTimer,
  QuestionNavigator,
  SubmitConfirmationDialog,
} from "@/components/exam/exam-shell";
import { ListeningExamView } from "@/components/exam/listening-exam-view";
import { ReadingExamView } from "@/components/exam/reading-exam-view";
import { Button, QueryState } from "@/components/ui";
import { createIdempotencyKey } from "@/lib/api/client";
import { examAttemptsApi } from "@/lib/api/endpoints/exam-attempts";
import { getFriendlyErrorMessage } from "@/lib/api/error";
import { examKeys } from "@/lib/api/query-keys";
import type { ExamAttemptDetail } from "@/lib/api/types";
import { countAnsweredQuestions } from "@/lib/exam/question-meta";
import { clearCachedExamDraft, useExamAutosave } from "@/lib/exam/use-exam-autosave";
import { useExamTimer } from "@/lib/exam/use-exam-timer";

export default function StudentExamAttemptPage() {
  const params = useParams<{ attemptId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const attemptId = decodeURIComponent(params.attemptId);

  const attemptQuery = useQuery({
    queryKey: examKeys.attemptDetail(attemptId),
    queryFn: () => examAttemptsApi.getById(attemptId),
    staleTime: 0,
  });

  return (
    <ExamShell backHref="/student/practice">
      <QueryState
        isLoading={attemptQuery.isLoading}
        isError={attemptQuery.isError}
        error={attemptQuery.error}
        isEmpty={!attemptQuery.data}
        emptyTitle="Không tìm thấy phòng thi"
        emptyDescription="Lượt thi không tồn tại hoặc bạn không có quyền truy cập."
        onRetry={() => void attemptQuery.refetch()}
      >
        {attemptQuery.data && (
          <ActiveExamWorkspace
            attempt={attemptQuery.data}
            onCompleted={() => {
              void queryClient.invalidateQueries({ queryKey: examKeys.attemptsRoot });
              router.replace(`/student/exam/${encodeURIComponent(attemptId)}/result`);
            }}
          />
        )}
      </QueryState>
    </ExamShell>
  );
}

function ActiveExamWorkspace({
  attempt,
  onCompleted,
}: {
  attempt: ExamAttemptDetail;
  onCompleted: () => void;
}) {
  const [selectedPartId, setSelectedPartId] = useState<string>(attempt.parts[0]?.id ?? "");
  const activePartId = attempt.parts.some((p) => p.id === selectedPartId)
    ? selectedPartId
    : (attempt.parts[0]?.id ?? "");
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [submitOpen, setSubmitOpen] = useState(false);
  const [serverLocked, setServerLocked] = useState(
    attempt.status === "SUBMITTED" || attempt.status === "EXPIRED",
  );
  const idempotencyKeyRef = useRef<string>(createIdempotencyKey());
  const autoExpiredRef = useRef(false);

  const isLocked = serverLocked || attempt.status !== "IN_PROGRESS";

  const timer = useExamTimer({
    expiresAt: attempt.expiresAt,
    serverTime: attempt.serverTime,
    initialRemainingSeconds: attempt.remainingSeconds,
    active: !isLocked,
    onExpire: () => {
      if (autoExpiredRef.current) return;
      autoExpiredRef.current = true;
      setServerLocked(true);
      void executeSubmit(true);
    },
  });

  const autosave = useExamAutosave({
    attemptId: attempt.attemptId,
    initialAnswers: attempt.answers,
    initialFlaggedIds: attempt.flaggedQuestionIds ?? [],
    initialRevision: attempt.revision,
    disabled: isLocked || timer.isExpired,
    onServerSync: ({ serverTime, remainingSeconds }) => {
      timer.syncServerClock(serverTime, remainingSeconds);
    },
    onAttemptLocked: () => {
      setServerLocked(true);
    },
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const flushed = await autosave.flushBeforeSubmit();
      return examAttemptsApi.submit(
        attempt.attemptId,
        {
          expectedRevision: flushed.revision,
          answers: flushed.answers,
          flaggedQuestionIds: flushed.flaggedQuestionIds,
        },
        idempotencyKeyRef.current,
      );
    },
    onSuccess: () => {
      clearCachedExamDraft(attempt.attemptId);
      setSubmitOpen(false);
      onCompleted();
    },
  });

  const executeSubmit = useCallback(
    async (isAutoExpire = false) => {
      if (submitMutation.isPending) return;
      try {
        await submitMutation.mutateAsync();
      } catch {
        if (isAutoExpire) {
          onCompleted();
        }
      }
    },
    [onCompleted, submitMutation],
  );

  const flaggedSet = useMemo(() => new Set(autosave.flaggedIds), [autosave.flaggedIds]);
  const answeredCount = countAnsweredQuestions(autosave.answers);

  return (
    <div className="flex min-h-screen flex-col">
      <ExamHeader
        title={attempt.testTitle}
        skill={attempt.skill}
        mode={attempt.mode}
        backHref={`/student/practice/${encodeURIComponent(attempt.testId)}`}
        isSubmitting={submitMutation.isPending}
        isLocked={isLocked || timer.isExpired}
        onRequestSubmit={() => setSubmitOpen(true)}
        autosaveNode={
          <AutosaveIndicator
            status={autosave.syncStatus}
            lastSavedAt={autosave.lastSavedAt}
            errorMessage={autosave.errorMessage}
            onRetry={() => void autosave.retrySave()}
          />
        }
        progressNode={
          <ExamProgress
            answeredCount={answeredCount}
            totalQuestions={attempt.totalQuestions}
          />
        }
        timerNode={
          <ExamTimer
            formatted={timer.formatted}
            isWarningLow={timer.isWarningLow}
            isCritical={timer.isCritical}
            isExpired={timer.isExpired || attempt.status === "EXPIRED"}
          />
        }
      />

      {isLocked && (
        <div
          role="status"
          className="border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-center text-sm font-medium text-amber-950"
        >
          {attempt.status === "EXPIRED" || timer.isExpired
            ? "Thời gian làm bài đã hết. Bài thi đã khóa chỉnh sửa."
            : "Lượt làm bài này đã được nộp."}{" "}
          <Link
            href={`/student/exam/${encodeURIComponent(attempt.attemptId)}/result`}
            className="ml-2 font-bold text-blue-700 underline"
          >
            Xem kết quả ngay
          </Link>
        </div>
      )}

      {submitMutation.isError && (
        <div className="mx-auto mt-3 flex max-w-3xl items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-800">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{getFriendlyErrorMessage(submitMutation.error)}</span>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void executeSubmit(false)}
          >
            Thử nộp lại
          </Button>
        </div>
      )}

      <main className="flex flex-1 flex-col">
        {attempt.skill === "READING" ? (
          <ReadingExamView
            parts={attempt.parts}
            activePartId={activePartId}
            onSelectPart={setSelectedPartId}
            answers={autosave.answers}
            flaggedIds={flaggedSet}
            activeQuestionId={activeQuestionId}
            disabled={isLocked || timer.isExpired}
            onAnswerChange={autosave.setAnswer}
            onToggleFlag={autosave.toggleFlag}
          />
        ) : (
          <ListeningExamView
            parts={attempt.parts}
            activePartId={activePartId}
            onSelectPart={setSelectedPartId}
            answers={autosave.answers}
            flaggedIds={flaggedSet}
            activeQuestionId={activeQuestionId}
            disabled={isLocked || timer.isExpired}
            onAnswerChange={autosave.setAnswer}
            onToggleFlag={autosave.toggleFlag}
          />
        )}
      </main>

      <QuestionNavigator
        parts={attempt.parts}
        activePartId={activePartId}
        answers={autosave.answers}
        flaggedIds={flaggedSet}
        activeQuestionId={activeQuestionId}
        onSelectQuestion={(partId, questionId) => {
          setSelectedPartId(partId);
          setActiveQuestionId(questionId);
        }}
      />

      <SubmitConfirmationDialog
        open={submitOpen}
        answeredCount={answeredCount}
        totalQuestions={attempt.totalQuestions}
        flaggedCount={autosave.flaggedIds.length}
        isSubmitting={submitMutation.isPending}
        onClose={() => setSubmitOpen(false)}
        onConfirm={() => void executeSubmit(false)}
      />
    </div>
  );
}
