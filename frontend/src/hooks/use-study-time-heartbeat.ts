"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { studySessionsApi } from "@/lib/api/endpoints/study-sessions";

const HEARTBEAT_INTERVAL_MS = 60_000;
const IDLE_TIMEOUT_MS = 180_000;

/**
 * Formats an integer duration in seconds into a concise Vietnamese label
 * (e.g. `0` -> `"0 phút"`, `300` -> `"5 phút"`, `42600` -> `"11 giờ 50 phút"`).
 */
export function formatStudyDuration(totalSeconds: number): string {
  const safeSeconds = Number.isFinite(totalSeconds) ? Math.max(0, Math.floor(totalSeconds)) : 0;
  const totalMinutes = Math.floor(safeSeconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours === 0) {
    return `${minutes} phút`;
  }
  if (minutes === 0) {
    return `${hours} giờ`;
  }
  return `${hours} giờ ${minutes} phút`;
}

/**
 * Tracks active student interaction on the client and dispatches a 60s
 * study-time heartbeat while the tab is visible and the student was active
 * within the past 180 seconds.
 */
export function useStudyTimeHeartbeat(enabled = true): void {
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const lastInteractionAtRef = useRef<number>(0);

  useEffect(() => {
    pathnameRef.current = pathname;
    lastInteractionAtRef.current = Date.now();
  }, [pathname]);

  useEffect(() => {
    if (!enabled || typeof window === "undefined" || typeof document === "undefined") {
      return;
    }

    lastInteractionAtRef.current = Date.now();

    const recordInteraction = () => {
      lastInteractionAtRef.current = Date.now();
    };

    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"] as const;
    for (const eventName of events) {
      window.addEventListener(eventName, recordInteraction, { passive: true });
    }

    const intervalId = window.setInterval(() => {
      if (document.visibilityState !== "visible") {
        return;
      }
      if (Date.now() - lastInteractionAtRef.current > IDLE_TIMEOUT_MS) {
        return;
      }
      void Promise.resolve(
        studySessionsApi.heartbeat({
          deltaSeconds: 60,
          route: pathnameRef.current || undefined,
        }),
      ).catch(() => {
        // Silently ignore transient network failures so studying is never disrupted
      });
    }, HEARTBEAT_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
      for (const eventName of events) {
        window.removeEventListener(eventName, recordInteraction);
      }
    };
  }, [enabled]);
}
