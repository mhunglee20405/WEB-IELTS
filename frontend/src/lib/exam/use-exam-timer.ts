"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { formatExamDurationSeconds } from "./question-meta";

export interface UseExamTimerOptions {
  expiresAt: string;
  serverTime?: string;
  initialRemainingSeconds?: number;
  active: boolean;
  onExpire?: () => void;
}

export interface UseExamTimerResult {
  remainingSeconds: number;
  formatted: string;
  isWarningLow: boolean;
  isCritical: boolean;
  isExpired: boolean;
  syncServerClock: (nextServerTime: string, nextRemainingSeconds?: number) => void;
}

function deriveOffsetMs(
  expiresMs: number,
  srvTime?: string,
  remSeconds?: number,
): number {
  if (typeof remSeconds === "number" && Number.isFinite(remSeconds) && Number.isFinite(expiresMs)) {
    return expiresMs - remSeconds * 1000 - Date.now();
  }
  if (srvTime) {
    const parsedSrv = Date.parse(srvTime);
    if (Number.isFinite(parsedSrv)) {
      return parsedSrv - Date.now();
    }
  }
  return 0;
}

export function useExamTimer({
  expiresAt,
  serverTime,
  initialRemainingSeconds,
  active,
  onExpire,
}: UseExamTimerOptions): UseExamTimerResult {
  const onExpireRef = useRef(onExpire);
  const offsetMsRef = useRef(0);
  const hasFiredExpireRef = useRef(false);

  const expiresMs = useMemo(() => Date.parse(expiresAt), [expiresAt]);

  const [remainingSeconds, setRemainingSeconds] = useState<number>(() =>
    typeof initialRemainingSeconds === "number" && Number.isFinite(initialRemainingSeconds)
      ? Math.max(0, Math.floor(initialRemainingSeconds))
      : 0,
  );

  useEffect(() => {
    onExpireRef.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    offsetMsRef.current = deriveOffsetMs(expiresMs, serverTime, initialRemainingSeconds);
    hasFiredExpireRef.current = false;
  }, [expiresMs, serverTime, initialRemainingSeconds]);

  useEffect(() => {
    if (!active) return;

    const tick = () => {
      const next = Number.isFinite(expiresMs)
        ? Math.max(0, Math.floor((expiresMs - (Date.now() + offsetMsRef.current)) / 1000))
        : Math.max(0, initialRemainingSeconds ?? 0);
      setRemainingSeconds(next);
      if (next <= 0 && !hasFiredExpireRef.current) {
        hasFiredExpireRef.current = true;
        onExpireRef.current?.();
      }
    };

    const initTimer = window.setTimeout(tick, 0);
    const intervalId = window.setInterval(tick, 1000);
    return () => {
      window.clearTimeout(initTimer);
      window.clearInterval(intervalId);
    };
  }, [active, expiresMs, initialRemainingSeconds]);

  const syncServerClock = useCallback(
    (nextServerTime: string, nextRemainingSeconds?: number) => {
      offsetMsRef.current = deriveOffsetMs(expiresMs, nextServerTime, nextRemainingSeconds);
      const updated = Number.isFinite(expiresMs)
        ? Math.max(0, Math.floor((expiresMs - (Date.now() + offsetMsRef.current)) / 1000))
        : Math.max(0, nextRemainingSeconds ?? 0);
      setRemainingSeconds(updated);
      if (updated <= 0 && active && !hasFiredExpireRef.current) {
        hasFiredExpireRef.current = true;
        onExpireRef.current?.();
      }
    },
    [active, expiresMs],
  );

  return {
    remainingSeconds,
    formatted: formatExamDurationSeconds(remainingSeconds),
    isWarningLow: remainingSeconds > 0 && remainingSeconds <= 300,
    isCritical: remainingSeconds > 0 && remainingSeconds <= 60,
    isExpired: remainingSeconds <= 0,
    syncServerClock,
  };
}
