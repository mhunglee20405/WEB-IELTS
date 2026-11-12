"use client";

import { useEffect } from "react";

/**
 * Keeps `document.title` synchronized for Client Component routes when
 * Next.js App Router metadata reconciliation re-applies a parent layout title.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    const applyTitle = () => {
      if (document.title !== title) {
        document.title = title;
      }
    };

    applyTitle();

    if (!document.head || typeof MutationObserver === "undefined") {
      return;
    }

    const observer = new MutationObserver(() => {
      applyTitle();
    });

    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
    };
  }, [title]);
}

