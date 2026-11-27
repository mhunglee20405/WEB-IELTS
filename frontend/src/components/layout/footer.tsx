import { cn } from "@/lib/utils/cn";

export interface FooterProps {
  className?: string;
}

/**
 * Contextual LMS Footer for non-admin portals (Student / Teacher / Public).
 * Rendered at the bottom of the scrollable main content container via `mt-auto`.
 */
export function Footer({ className }: FooterProps) {
  return (
    <footer
      role="contentinfo"
      className={cn(
        "mt-auto shrink-0 border-t border-slate-200 bg-white/80 px-4 py-4 text-xs text-slate-500 backdrop-blur-xs md:px-8 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-400",
        className,
      )}
    >
      <div className="flex flex-col items-center justify-between gap-2 text-center sm:flex-row sm:text-left">
        <p className="font-normal text-slate-500 dark:text-slate-400">
          © 2026 IELTS Academic LMS. All rights reserved.
        </p>
        <ul className="flex flex-wrap items-center justify-center gap-4 sm:justify-end">
          <li>
            <a
              href="#user-guide"
              className="text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
            >
              Hướng dẫn sử dụng
            </a>
          </li>
          <li>
            <a
              href="#support"
              className="text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
            >
              Hỗ trợ kỹ thuật
            </a>
          </li>
          <li>
            <a
              href="#terms"
              className="text-slate-500 underline-offset-4 transition-colors hover:text-slate-900 hover:underline dark:text-slate-400 dark:hover:text-slate-100"
            >
              Điều khoản dịch vụ
            </a>
          </li>
        </ul>
      </div>
    </footer>
  );
}
