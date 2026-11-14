import { BookOpen, CalendarClock, Headphones, Lock, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { buttonVariants, MetaTag, StatusBadge } from "@/components/ui";
import { PASS_SCORE_THRESHOLD, type StudentAssignmentSummary } from "@/lib/api/types";
import {
  formatBalancedDuration,
  formatDateKeyVi,
  formatVnDateTime,
} from "@/lib/time/vn-time";
import { cn } from "@/lib/utils/cn";

export interface AssignmentCardProps {
  item: StudentAssignmentSummary;
  nowMs: number;
}

function getRemainingSummary(effectiveDueAt: string, nowMs: number): {
  isOverdue: boolean;
  label: string;
} {
  const diffMs = new Date(effectiveDueAt).getTime() - nowMs;
  if (Number.isNaN(diffMs)) {
    return { isOverdue: false, label: "—" };
  }
  const absMinutes = Math.floor(Math.abs(diffMs) / 60_000);
  const days = Math.floor(absMinutes / (60 * 24));
  const hours = Math.floor((absMinutes % (60 * 24)) / 60);
  const minutes = absMinutes % 60;
  const formatted = formatBalancedDuration({ days, hours, minutes });
  return diffMs < 0
    ? { isOverdue: true, label: `Quá hạn ${formatted}` }
    : { isOverdue: false, label: `Còn ${formatted}` };
}

export function AssignmentCard({ item, nowMs }: AssignmentCardProps) {
  const openAtMs = new Date(item.openAt).getTime();
  const isPreOpen = !Number.isNaN(openAtMs) && openAtMs > nowMs;
  const hasExtendedDue = item.effectiveDueAt !== item.dueAt;
  const remaining = getRemainingSummary(item.effectiveDueAt, nowMs);

  const badgeStatus = isPreOpen
    ? "upcoming"
    : item.passed
      ? "passed"
      : item.status;

  const ctaLabel = item.passed
    ? "Xem kết quả & đáp án"
    : item.status === "in_progress"
      ? "Tiếp tục làm bài"
      : item.attemptsCount > 0
        ? "Làm lại bài"
        : "Bắt đầu làm bài";

  const SkillIcon = item.exerciseType === "reading" ? BookOpen : Headphones;

  return (
    <article className="lms-card justify-between">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <MetaTag variant={item.exerciseType === "reading" ? "accent" : "info"}>
              <SkillIcon className="h-3.5 w-3.5" aria-hidden={true} />
              {item.exerciseType === "reading" ? "Reading" : "Listening"}
            </MetaTag>
            <span className="text-xs font-medium text-slate-700">{item.courseTitle}</span>
          </div>
          <StatusBadge
            status={badgeStatus}
            labelOverride={isPreOpen ? "Chưa mở" : undefined}
          />
        </div>

        <h3 className="text-base font-semibold leading-snug text-slate-900">
          {item.title}
        </h3>

        <dl className="grid gap-1.5 text-xs text-slate-600 sm:grid-cols-2">
          <div>
            <dt className="inline font-medium text-slate-700">Ngày giao: </dt>
            <dd className="inline">{formatDateKeyVi(item.assignedDate)}</dd>
          </div>
          <div>
            <dt className="inline font-medium text-slate-700">Mở bài: </dt>
            <dd className="inline">{formatVnDateTime(item.openAt)}</dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="inline font-medium text-slate-700">
              {hasExtendedDue ? "Hạn mới (đã gia hạn): " : "Hạn nộp: "}
            </dt>
            <dd className="inline">
              {formatVnDateTime(item.effectiveDueAt)}{" "}
              <span
                className={cn(
                  "font-medium",
                  remaining.isOverdue && !item.passed ? "text-red-700" : "text-slate-700",
                )}
              >
                ({item.passed ? "Đã đạt" : remaining.label})
              </span>
            </dd>
          </div>
        </dl>

        {isPreOpen ? (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-950">
            <Lock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden={true} />
            <p>
              Bài tập sẽ tự động mở vào{" "}
              <strong className="font-semibold">{formatVnDateTime(item.openAt)}</strong> (giờ
              Việt Nam). Câu hỏi và tệp nghe chỉ hiển thị sau thời điểm mở bài.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <MetaTag variant="neutral">Số lần làm: {item.attemptsCount}</MetaTag>
            {item.bestScore !== null ? (
              <MetaTag variant={item.passed ? "success" : "warning"}>
                Điểm cao nhất: {item.bestScore}% (Yêu cầu &ge; {PASS_SCORE_THRESHOLD}%)
              </MetaTag>
            ) : null}
            {item.answerReviewUnlocked ? (
              <MetaTag variant="success">Đã mở đáp án chi tiết</MetaTag>
            ) : null}
            {item.translationAvailable ? (
              <MetaTag variant="info">Có bài dịch đối chiếu</MetaTag>
            ) : null}
            {item.penaltyApplied ? (
              <MetaTag variant="danger">
                <ShieldAlert className="h-3.5 w-3.5" aria-hidden={true} />
                Có điểm phạt quá hạn
              </MetaTag>
            ) : null}
          </div>
        )}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3">
        {isPreOpen ? (
          <button
            type="button"
            disabled
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-slate-300 bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 cursor-not-allowed"
          >
            <CalendarClock className="h-4 w-4" aria-hidden={true} />
            Chưa đến giờ mở bài
          </button>
        ) : (
          <Link
            href={`/student/assignments/${item.studentAssignmentId}`}
            className={buttonVariants({ variant: "soft" })}
          >
            {ctaLabel}
            <span className="sr-only">: {item.title}</span>
          </Link>
        )}

        {!isPreOpen && !item.passed ? (
          <Link
            href={`/student/extensions?studentAssignmentId=${encodeURIComponent(
              item.studentAssignmentId,
            )}`}
            className={buttonVariants({ variant: "ghost", size: "sm" })}
          >
            Xin gia hạn
            <span className="sr-only">: {item.title}</span>
          </Link>
        ) : null}
      </footer>
    </article>
  );
}

