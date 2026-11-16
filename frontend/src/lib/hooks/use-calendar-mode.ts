"use client";

import { useSyncExternalStore, useCallback } from "react";

export type CalendarMode = "week" | "month";

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("ielts-calendar-mode-change", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("ielts-calendar-mode-change", callback);
  };
}

export function useCalendarMode(
  storageKey: string,
  defaultMode: CalendarMode = "week",
): [CalendarMode, (mode: CalendarMode) => void] {
  const getSnapshot = useCallback((): CalendarMode => {
    if (typeof window === "undefined") return defaultMode;
    try {
      const val = localStorage.getItem(storageKey);
      return val === "month" || val === "week" ? val : defaultMode;
    } catch {
      return defaultMode;
    }
  }, [storageKey, defaultMode]);

  const getServerSnapshot = useCallback((): CalendarMode => defaultMode, [defaultMode]);

  const mode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const setMode = useCallback(
    (newMode: CalendarMode) => {
      try {
        localStorage.setItem(storageKey, newMode);
        window.dispatchEvent(new CustomEvent("ielts-calendar-mode-change"));
      } catch {
        // Ignore restricted storage environments
      }
    },
    [storageKey],
  );

  return [mode, setMode];
}
