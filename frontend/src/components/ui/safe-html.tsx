"use client";

import { useEffect, useRef } from "react";
import { safeSetHtml, type SanitizePreset } from "@/lib/sanitize/html";
import { cn } from "@/lib/utils/cn";

export interface SafeHtmlProps {
  html: string;
  preset?: SanitizePreset;
  lang?: string;
  className?: string;
}

/**
 * Renders untrusted HTML safely using the native Sanitizer API (`setHTML`)
 * when supported, with a dynamic DOMPurify fallback configured to match native behavior.
 */
export function SafeHtml({ html, preset = "richText", lang, className }: SafeHtmlProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }

    let cancelled = false;
    void safeSetHtml(element, html, preset).catch(() => {
      if (!cancelled && containerRef.current) {
        containerRef.current.textContent = "";
      }
    });

    return () => {
      cancelled = true;
    };
  }, [html, preset]);

  return (
    <div
      ref={containerRef}
      lang={lang}
      className={cn("prose prose-slate max-w-none text-slate-800 leading-relaxed", className)}
    />
  );
}

