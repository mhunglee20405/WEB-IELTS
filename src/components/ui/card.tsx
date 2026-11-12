import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  as?: "article" | "section" | "div";
  children: ReactNode;
}

/**
 * Shared container card adhering to `.lms-card` design tokens, contrast,
 * and consistent hairline separation.
 */
export function Card({ as = "div", className, children, ...props }: CardProps) {
  const Component = as;
  return (
    <Component className={cn("lms-card", className)} {...props}>
      {children}
    </Component>
  );
}

export interface CardFooterProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
}

export function CardFooter({ className, children, ...props }: CardFooterProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

