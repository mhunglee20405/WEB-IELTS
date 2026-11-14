import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export type BadgeVariant =
  | "neutral"
  | "code"
  | "format"
  | "info"
  | "accent"
  | "success"
  | "warning"
  | "danger";

const BADGE_VARIANTS: Record<BadgeVariant, string> = {
  neutral: "border-slate-200 bg-slate-100 text-slate-800",
  code: "border-slate-200 bg-slate-50 font-mono text-slate-800",
  format: "border-slate-300 bg-white text-slate-700",
  info: "border-blue-200 bg-blue-50/75 text-blue-900",
  accent: "border-indigo-200 bg-indigo-50/75 text-indigo-900",
  success: "border-emerald-300 bg-emerald-50 text-emerald-900",
  warning: "border-amber-300 bg-amber-50 text-amber-900",
  danger: "border-red-300 bg-red-50 text-red-900",
};

export interface BadgeProps {
  children: ReactNode;
  variant?: BadgeVariant;
  className?: string;
}

/**
 * Rectangular metadata tag (`rounded-md`, restrained neutral surfaces) visually
 * separated from pill-shaped semantic `StatusBadge` indicators.
 */
export function Badge({ children, variant = "neutral", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium leading-5 whitespace-nowrap",
        BADGE_VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export const MetaTag = Badge;
export type MetaTagProps = BadgeProps;

