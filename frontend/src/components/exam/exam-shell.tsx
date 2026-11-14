"use client";

import React, { useRef } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock,
  CloudOff,
  Flag,
  Loader2,
  RefreshCw,
  Send,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModalDialog } from "@/components/ui/modal-dialog";
import type {
  ExamActiveAttemptBanner,
  ExamAnswerValue,
  ExamMode,
  ExamPartPublic,
  ExamSkill,
} from "@/lib/api/types";
import type { ExamAutosaveStatus } from "@/lib/exam/use-exam-autosave";
import { isAnsweredValue } from "@/lib/exam/question-meta";
import { cn } from "@/lib/utils/cn";

export function ExamTimer({
  formatted,
  isWarningLow,
  isCritical,
  isExpired,
}: {
  formatted: string;
  isWarningLow: boolean;
  isCritical: boolean;
  isExpired: boolean;
}) {
  return (
    <div
      data-testid="exam-timer"
      className={cn(
        "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-sm font-bold tabular-nums",
        isExpired
          ? "border-rose-300 bg-rose-50 text-rose-800"
          : isCritical
            ? "border-rose-300 bg-rose-50 text-rose-700"
            : isWarningLow
              ? "border-amber-300 bg-amber-50 text-amber-800"
              : "border-slate-200 bg-slate-50 text-slate-900",
      )}
    >
      <Clock className="h-4 w-4 shrink-0" />
      <span>{isExpired ? "00:00 (Hết giờ)" : formatted}</span>
    </div>
  );
}

export function ExamProgress({
  answeredCount,
  totalQuestions,
}: {
  answeredCount: number;
  totalQuestions: number;
}) {
  const safeTotal = Math.max(1, totalQuestions);
  const percent = Math.round((answeredCount / safeTotal) * 100);
  return (
    <div className="flex items-center gap-2.5 text-xs text-slate-700">
      <progress
        className="lms-progress h-2 w-24 overflow-hidden rounded-full sm:w-32"
        value={answeredCount}
        max={safeTotal}
        aria-label={`Tiến độ trả lời: ${answeredCount} trên ${totalQuestions} câu`}
      />
      <span className="font-semibold tabular-nums">
        {answeredCount}/{totalQuestions} câu ({percent}%)
      </span>
    </div>
  );
}

export function AutosaveIndicator({
  status,
  lastSavedAt,
  errorMessage,
  onRetry,
}: {
  status: ExamAutosaveStatus;
  lastSavedAt: string | null;
  errorMessage: string | null;
  onRetry?: () => void;
}) {
  if (status === "saving" || status === "conflict") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700"
      >
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {status === "conflict" ? "Đang đồng bộ lại..." : "Đang lưu nháp..."}
      </span>
    );
  }

  if (status === "unsynced") {
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-700"
      >
        <CloudOff className="h-3.5 w-3.5" />
        <span>{errorMessage ?? "Chưa đồng bộ máy chủ"}</span>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center gap-1 rounded border border-rose-300 bg-rose-50 px-1.5 py-0.5 text-[11px] font-semibold text-rose-800 hover:bg-rose-100"
          >
            <RefreshCw className="h-3 w-3" />
            Lưu lại
          </button>
        )}
      </span>
    );
  }

  if (status === "saved" && lastSavedAt) {
    const timeLabel = new Date(lastSavedAt).toLocaleTimeString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    return (
      <span
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700"
      >
        <CheckCircle2 className="h-3.5 w-3.5" />
        Đã lưu lúc {timeLabel}
      </span>
    );
  }

  return <span className="text-xs text-slate-500">Tự động lưu mỗi khi nhập</span>;
}

export function ExamHeader({
  title,
  skill,
  mode,
  backHref,
  timerNode,
  progressNode,
  autosaveNode,
  isPreview = false,
  isSubmitting = false,
  isLocked = false,
  onRequestSubmit,
}: {
  title: string;
  skill: ExamSkill;
  mode: ExamMode;
  backHref: string;
  timerNode?: React.ReactNode;
  progressNode?: React.ReactNode;
  autosaveNode?: React.ReactNode;
  isPreview?: boolean;
  isSubmitting?: boolean;
  isLocked?: boolean;
  onRequestSubmit?: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-2.5 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href={backHref}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thoát phòng thi</span>
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="info">{skill === "READING" ? "Reading" : "Listening"}</Badge>
              <Badge variant="neutral">
                {isPreview ? "Xem trước đề" : mode === "FULL" ? "Full Test" : "Part Practice"}
              </Badge>
            </div>
            <h1 className="mt-0.5 truncate text-sm font-bold text-slate-900 sm:text-base">
              {title}
            </h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {autosaveNode}
          {progressNode}
          {timerNode}
          {onRequestSubmit && !isPreview && (
            <Button
              variant="primary"
              size="sm"
              loading={isSubmitting}
              disabled={isLocked || isSubmitting}
              onClick={onRequestSubmit}
              data-testid="exam-submit-open-btn"
            >
              <Send className="h-3.5 w-3.5" />
              Nộp bài
            </Button>
          )}
        </div>
      </div>
    </header>
  );
}

export function QuestionNavigator({
  parts,
  activePartId,
  answers,
  flaggedIds,
  activeQuestionId,
  onSelectQuestion,
}: {
  parts: ExamPartPublic[];
  activePartId: string;
  answers: Record<string, ExamAnswerValue | undefined>;
  flaggedIds: Set<string>;
  activeQuestionId: string | null;
  onSelectQuestion: (partId: string, questionId: string) => void;
}) {
  const jumpSeqRef = useRef(0);

  const handleJump = async (partId: string, questionId: string) => {
    const seq = ++jumpSeqRef.current;
    onSelectQuestion(partId, questionId);

    // Allow React frame render when switching parts before awaiting scroll completion
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => resolve());
    });
    if (seq !== jumpSeqRef.current) return;

    const target = document.getElementById(`exam-question-${questionId}`);
    if (!target) return;

    const result = target.scrollIntoView({
      behavior: "smooth",
      block: "center",
    }) as unknown;
    if (result && typeof (result as Promise<void>).then === "function") {
      await result;
    }
    if (seq !== jumpSeqRef.current) return;
    target.focus({ preventScroll: true });
  };

  return (
    <nav
      aria-label="Điều hướng câu hỏi"
      className="sticky bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur-xs sm:px-6"
    >
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-2 overflow-x-auto pb-0.5">
        {parts.map((part) => (
          <div
            key={part.id}
            className={cn(
              "flex items-center gap-1 rounded-lg border px-2 py-1",
              part.id === activePartId
                ? "border-blue-200 bg-blue-50/50"
                : "border-slate-200 bg-slate-50/70",
            )}
          >
            <span className="mr-1 text-[11px] font-bold tracking-wide text-slate-600 uppercase">
              {part.partType === "PASSAGE" ? `P${part.partNumber}` : `S${part.partNumber}`}
            </span>
            {part.questionGroups.flatMap((g) =>
              g.questions.map((q) => {
                const answered = isAnsweredValue(answers[q.id]);
                const flagged = flaggedIds.has(q.id);
                const current = activeQuestionId === q.id;
                return (
                  <button
                    key={q.id}
                    type="button"
                    onClick={() => void handleJump(part.id, q.id)}
                    aria-label={`Đi tới câu ${q.questionNumber}${answered ? ", đã trả lời" : ", chưa trả lời"}${flagged ? ", đã gắn cờ" : ""}`}
                    className={cn(
                      "relative inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-1.5 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600",
                      current && "ring-2 ring-blue-600 ring-offset-1",
                      answered
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100",
                    )}
                  >
                    {q.questionNumber}
                    {flagged && (
                      <Flag
                        aria-hidden="true"
                        className="absolute -top-1 -right-1 h-3 w-3 fill-amber-400 text-amber-600"
                      />
                    )}
                  </button>
                );
              }),
            )}
          </div>
        ))}
      </div>
    </nav>
  );
}

export function SubmitConfirmationDialog({
  open,
  answeredCount,
  totalQuestions,
  flaggedCount,
  isSubmitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  answeredCount: number;
  totalQuestions: number;
  flaggedCount: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const unanswered = Math.max(0, totalQuestions - answeredCount);
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Xác nhận nộp bài thi"
      description="Sau khi nộp bài, máy chủ sẽ chấm điểm tự động và khóa chỉnh sửa cho lượt thi này."
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center">
          <div>
            <p className="text-xs text-slate-500">Đã trả lời</p>
            <p className="text-lg font-bold text-emerald-700">{answeredCount}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Bỏ trống</p>
            <p className="text-lg font-bold text-amber-700">{unanswered}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Đang gắn cờ</p>
            <p className="text-lg font-bold text-blue-700">{flaggedCount}</p>
          </div>
        </div>

        {unanswered > 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
            <span>
              Bạn vẫn còn <strong>{unanswered} câu chưa trả lời</strong>. Bạn có thể quay lại kiểm tra hoặc nhấn xác nhận nộp ngay.
            </span>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Tiếp tục làm bài
          </Button>
          <Button
            variant="primary"
            loading={isSubmitting}
            onClick={onConfirm}
            data-testid="exam-submit-confirm-btn"
          >
            Xác nhận nộp bài
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export function AttemptResumeDialog({
  open,
  activeAttempt,
  onClose,
  onResume,
  onStartFresh,
}: {
  open: boolean;
  activeAttempt: ExamActiveAttemptBanner | null;
  onClose: () => void;
  onResume: (attemptId: string) => void;
  onStartFresh: () => void;
}) {
  if (!activeAttempt) return null;
  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title="Phát hiện lượt làm bài đang mở"
      description="Hệ thống đã lưu tiến độ bài làm gần nhất của bạn trên máy chủ."
    >
      <div className="space-y-4 text-sm text-slate-700">
        <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3">
          <p className="font-semibold text-blue-950">
            Chế độ: {activeAttempt.mode === "FULL" ? "Full Test" : "Part Practice"}
          </p>
          <p className="mt-1 text-xs text-blue-900">
            Tiến độ đã lưu: {activeAttempt.answeredCount}/{activeAttempt.totalQuestions} câu hỏi
          </p>
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onStartFresh}>
            Bắt đầu lựa chọn hiện tại
          </Button>
          <Button
            variant="primary"
            onClick={() => onResume(activeAttempt.attemptId)}
          >
            Tiếp tục lượt đang làm
          </Button>
        </div>
      </div>
    </ModalDialog>
  );
}

export class ExamErrorBoundary extends React.Component<
  { children: React.ReactNode; backHref?: string },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode; backHref?: string }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, message: error.message || "Lỗi hiển thị phòng thi." };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="mx-auto my-12 max-w-lg rounded-xl border border-rose-200 bg-white p-6 text-center shadow-sm">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-600" />
          <h2 className="mt-3 text-lg font-bold text-slate-900">
            Không thể hiển thị phòng thi
          </h2>
          <p className="mt-2 text-sm text-slate-600">{this.state.message}</p>
          <div className="mt-5 flex justify-center gap-3">
            <Button
              variant="secondary"
              onClick={() => this.setState({ hasError: false, message: "" })}
            >
              Thử tải lại
            </Button>
            <Link
              href={this.props.backHref ?? "/student/practice"}
              className="inline-flex min-h-10 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
            >
              Quay lại thư viện đề
            </Link>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ExamShell({
  children,
  backHref,
}: {
  children: React.ReactNode;
  backHref?: string;
}) {
  return (
    <ExamErrorBoundary backHref={backHref}>
      <div className="flex min-h-screen flex-col bg-slate-50">{children}</div>
    </ExamErrorBoundary>
  );
}

