import { cn } from "@/lib/utils/cn";

export type BadgeStatus =
  | "not_started"
  | "in_progress"
  | "submitted"
  | "passed"
  | "overdue"
  | "extended"
  | "pending"
  | "approved"
  | "rejected"
  | "needs_revision"
  | "draft"
  | "published"
  | "archived"
  | "active"
  | "upcoming"
  | "inactive"
  | "suspended"
  | "reversed"
  | "scheduled"
  | "live"
  | "completed"
  | "cancelled";

interface StatusConfig {
  label: string;
  classes: string;
  dot: string;
}

const STATUS_MAP: Record<BadgeStatus, StatusConfig> = {
  not_started: {
    label: "Chưa làm",
    classes: "border-slate-300 bg-slate-100 text-slate-800",
    dot: "bg-slate-600",
  },
  in_progress: {
    label: "Đang làm",
    classes: "border-blue-300 bg-blue-50 text-blue-900",
    dot: "bg-blue-700",
  },
  submitted: {
    label: "Đã nộp",
    classes: "border-indigo-300 bg-indigo-50 text-indigo-900",
    dot: "bg-indigo-700",
  },
  passed: {
    label: "Đạt (>=70%)",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-700",
  },
  overdue: {
    label: "Quá hạn",
    classes: "border-red-300 bg-red-50 text-red-900",
    dot: "bg-red-700",
  },
  extended: {
    label: "Đã gia hạn",
    classes: "border-amber-300 bg-amber-50 text-amber-900",
    dot: "bg-amber-700",
  },
  pending: {
    label: "Chờ duyệt",
    classes: "border-amber-300 bg-amber-50 text-amber-900",
    dot: "bg-amber-700",
  },
  approved: {
    label: "Đã duyệt",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-700",
  },
  rejected: {
    label: "Từ chối",
    classes: "border-red-300 bg-red-50 text-red-900",
    dot: "bg-red-700",
  },
  needs_revision: {
    label: "Cần sửa lại",
    classes: "border-amber-300 bg-amber-50 text-amber-900",
    dot: "bg-amber-700",
  },
  draft: {
    label: "Bản nháp",
    classes: "border-slate-300 bg-slate-100 text-slate-800",
    dot: "bg-slate-600",
  },
  published: {
    label: "Đã xuất bản",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-700",
  },
  archived: {
    label: "Lưu trữ",
    classes: "border-slate-300 bg-slate-100 text-slate-800",
    dot: "bg-slate-600",
  },
  active: {
    label: "Đang hoạt động",
    classes: "border-emerald-300 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-700",
  },
  upcoming: {
    label: "Sắp mở",
    classes: "border-blue-300 bg-blue-50 text-blue-900",
    dot: "bg-blue-700",
  },
  inactive: {
    label: "Tạm ngưng",
    classes: "border-slate-300 bg-slate-100 text-slate-800",
    dot: "bg-slate-600",
  },
  suspended: {
    label: "Bị khóa",
    classes: "border-red-300 bg-red-50 text-red-900",
    dot: "bg-red-700",
  },
  reversed: {
    label: "Đã hoàn tác",
    classes: "border-teal-300 bg-teal-50 text-teal-900",
    dot: "bg-teal-700",
  },
  scheduled: {
    label: "Sắp diễn ra",
    classes: "border-blue-300 bg-blue-50 text-blue-900",
    dot: "bg-blue-700",
  },
  live: {
    label: "Đang diễn ra",
    classes: "border-emerald-400 bg-emerald-50 text-emerald-900",
    dot: "bg-emerald-700",
  },
  completed: {
    label: "Đã kết thúc",
    classes: "border-slate-300 bg-slate-100 text-slate-800",
    dot: "bg-slate-600",
  },
  cancelled: {
    label: "Đã hủy",
    classes: "border-red-300 bg-red-50 text-red-900",
    dot: "bg-red-700",
  },
};

export interface StatusBadgeProps {
  status: BadgeStatus;
  labelOverride?: string;
  className?: string;
}

/**
 * Semantic pill status badge with subtle surface tint, colored border, status dot,
 * and unambiguous Vietnamese text label (WCAG 1.4.1 / AA contrast >= 4.5:1).
 */
export function StatusBadge({ status, labelOverride, className }: StatusBadgeProps) {
  const config = STATUS_MAP[status];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 whitespace-nowrap",
        config.classes,
        className,
      )}
    >
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", config.dot)}
        aria-hidden={true}
      />
      <span>{labelOverride ?? config.label}</span>
    </span>
  );
}
