"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface NavItem {
  href: string;
  label: string;
  icon?: ReactNode;
}

export interface SidebarNavProps {
  navItems: readonly NavItem[];
  pathname: string;
  onNavigate?: () => void;
  className?: string;
}

/**
 * Shared sidebar navigation links list.
 * Enforces strictly identical dimensions and font-weight between active and inactive
 * states to eliminate layout shifts on hover or route selection.
 */
export function SidebarNav({
  navItems,
  pathname,
  onNavigate,
  className,
}: SidebarNavProps) {
  const cleanPath = pathname.replace(/\/+$/, "") || "/";

  return (
    <ul className={cn("space-y-1 p-3", className)}>
      {navItems.map((item) => {
        const cleanHref = item.href.replace(/\/+$/, "") || "/";
        const isActive =
          cleanPath === cleanHref ||
          (cleanHref !== "/" && cleanPath.startsWith(`${cleanHref}/`));

        return (
          <li key={item.href}>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={isActive ? "page" : undefined}
              className={cn(
                "group flex min-h-[44px] items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all duration-150 ease-out select-none active:scale-[0.98] motion-reduce:transform-none",
                isActive
                  ? "bg-blue-50 text-blue-900 shadow-[inset_3px_0_0_0_#1d4ed8]"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-950",
              )}
            >
              {item.icon ? (
                <span
                  className={cn(
                    "shrink-0 transition-transform duration-150 motion-reduce:transform-none group-hover:translate-x-0.5",
                    isActive ? "text-blue-700" : "text-slate-500 group-hover:text-slate-700",
                  )}
                  aria-hidden="true"
                >
                  {item.icon}
                </span>
              ) : null}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

export interface SidebarProps {
  navItems: readonly NavItem[];
  pathname: string;
  className?: string;
}

/**
 * Desktop flush-left fixed sidebar.
 * Standardized at w-64 (256px / 16rem), h-full, overflow-y-auto, border-r.
 */
export function Sidebar({ navItems, pathname, className }: SidebarProps) {
  return (
    <aside
      className={cn(
        "hidden h-full w-64 min-w-[16rem] max-w-[16rem] shrink-0 flex-col overflow-x-hidden overflow-y-auto border-r border-slate-200 bg-white lg:flex",
        className,
      )}
    >
      <nav aria-label="Điều hướng chính" className="min-h-full flex-1">
        <SidebarNav navItems={navItems} pathname={pathname} />
      </nav>
    </aside>
  );
}

