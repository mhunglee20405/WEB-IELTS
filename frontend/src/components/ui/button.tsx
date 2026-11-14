import { forwardRef, type ButtonHTMLAttributes } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export type ButtonVariant = "primary" | "soft" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary:
    "border border-transparent bg-blue-700 text-white shadow-xs hover:bg-blue-800 active:bg-blue-900",
  soft:
    "border border-blue-200 bg-blue-50 text-blue-900 hover:border-blue-300 hover:bg-blue-100",
  secondary:
    "border border-slate-300 bg-white text-slate-800 hover:border-slate-400 hover:bg-slate-50 hover:text-slate-950",
  ghost:
    "border border-transparent bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-950",
  danger:
    "border border-red-300 bg-red-50 text-red-900 hover:border-red-400 hover:bg-red-100",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-[44px] px-3 py-1.5 text-xs sm:text-sm gap-1.5",
  md: "min-h-[44px] px-4 py-2 text-sm gap-2",
  lg: "min-h-[48px] px-5 py-2.5 text-base gap-2",
};

export interface ButtonStyleOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}

/**
 * Shared CTA class generator ensuring a single primary blue hierarchy per view
 * while distinguishing soft card actions and quiet ghost controls.
 */
export function buttonVariants({
  variant = "secondary",
  size = "md",
  fullWidth = false,
  className,
}: ButtonStyleOptions = {}): string {
  return cn(
    "inline-flex items-center justify-center rounded-lg font-semibold whitespace-nowrap transition-all duration-150 active:scale-[0.97] motion-reduce:transform-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700 disabled:cursor-not-allowed disabled:opacity-50",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && "w-full",
    className,
  );
}

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    ButtonStyleOptions {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "secondary",
      size = "md",
      fullWidth = false,
      loading = false,
      disabled,
      className,
      type = "button",
      children,
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={Boolean(disabled || loading)}
        aria-busy={loading || undefined}
        className={buttonVariants({ variant, size, fullWidth, className })}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin shrink-0" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

