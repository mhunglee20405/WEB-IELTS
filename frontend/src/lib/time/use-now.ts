"use client";

import { useEffect, useState } from "react";

/**
 * Provides an SSR-safe / React-purity-safe current epoch timestamp in ms,
 * ticking on an optional interval without calling `Date.now()` directly during render.
 */
export function useNowMs(intervalMs: number = 60_000): number {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  useEffect(() => {
    if (intervalMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, intervalMs);
    return () => {
      window.clearInterval(timer);
    };
  }, [intervalMs]);

  return nowMs;
}

