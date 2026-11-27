"use client";

import { Moon, Sun } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";

export const THEME_STORAGE_KEY = "web_ielts_theme";

export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeContextValue {
  theme: ThemePreference;
  resolvedTheme: ResolvedTheme;
  setTheme: (nextTheme: ThemePreference) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

const themeListeners = new Set<() => void>();
const systemListeners = new Set<() => void>();
let fallbackStoredTheme: ThemePreference = "light";
let activeMediaQueryMatch: boolean | null = null;
let teardownSystemMedia: (() => void) | null = null;

function isValidThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

function readStoredTheme(): ThemePreference {
  if (typeof window === "undefined") {
    return "light";
  }
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidThemePreference(raw)) {
      fallbackStoredTheme = raw;
      return raw;
    }
    return "light";
  } catch {
    return fallbackStoredTheme;
  }
}

function writeStoredTheme(nextTheme: ThemePreference): void {
  fallbackStoredTheme = nextTheme;
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  } catch {
    // Ignore storage write failures (e.g. private browsing restrictions)
  }
}

function readSystemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return Boolean(window.matchMedia("(prefers-color-scheme: dark)")?.matches);
  } catch {
    return false;
  }
}

function applyResolvedThemeToDocument(resolvedTheme: ResolvedTheme): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.documentElement;
  root.classList.toggle("dark", resolvedTheme === "dark");
  root.style.colorScheme = resolvedTheme;
}

function notifyThemeListeners(): void {
  themeListeners.forEach((listener) => listener());
}

function subscribeTheme(listener: () => void): () => void {
  themeListeners.add(listener);

  if (typeof window === "undefined") {
    return () => {
      themeListeners.delete(listener);
    };
  }

  const handleStorage = (event: StorageEvent) => {
    if (event.key === null || event.key === THEME_STORAGE_KEY) {
      listener();
    }
  };

  window.addEventListener("storage", handleStorage);
  return () => {
    themeListeners.delete(listener);
    window.removeEventListener("storage", handleStorage);
  };
}

function getThemeSnapshot(): ThemePreference {
  return readStoredTheme();
}

function getThemeServerSnapshot(): ThemePreference {
  return "light";
}

function subscribeSystemTheme(listener: () => void): () => void {
  systemListeners.add(listener);

  if (
    !teardownSystemMedia &&
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      const mql = window.matchMedia("(prefers-color-scheme: dark)");
      if (mql) {
        activeMediaQueryMatch = Boolean(mql.matches);
        const handleChange = (event: MediaQueryListEvent | { matches: boolean }) => {
          activeMediaQueryMatch = Boolean(event.matches);
          systemListeners.forEach((cb) => cb());
        };

        if (typeof mql.addEventListener === "function") {
          mql.addEventListener("change", handleChange);
          teardownSystemMedia = () => {
            mql.removeEventListener("change", handleChange);
          };
        } else if (typeof mql.addListener === "function") {
          mql.addListener(handleChange);
          teardownSystemMedia = () => {
            mql.removeListener(handleChange);
          };
        }
      }
    } catch {
      // Ignore matchMedia errors in restricted environments
    }
  }

  return () => {
    systemListeners.delete(listener);
    if (systemListeners.size === 0) {
      teardownSystemMedia?.();
      teardownSystemMedia = null;
      activeMediaQueryMatch = null;
    }
  };
}

function getSystemThemeSnapshot(): ResolvedTheme {
  const prefersDark =
    activeMediaQueryMatch !== null ? activeMediaQueryMatch : readSystemPrefersDark();
  return prefersDark ? "dark" : "light";
}

function getSystemThemeServerSnapshot(): ResolvedTheme {
  return "light";
}

function useThemeStoreValue(): ThemeContextValue {
  const theme = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    getThemeServerSnapshot,
  );
  const systemTheme = useSyncExternalStore(
    subscribeSystemTheme,
    getSystemThemeSnapshot,
    getSystemThemeServerSnapshot,
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((nextTheme: ThemePreference) => {
    writeStoredTheme(nextTheme);
    const nextResolved: ResolvedTheme =
      nextTheme === "system" ? (readSystemPrefersDark() ? "dark" : "light") : nextTheme;
    applyResolvedThemeToDocument(nextResolved);
    notifyThemeListeners();
  }, []);

  const toggleTheme = useCallback(() => {
    const nextTheme: ThemePreference = resolvedTheme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
  }, [resolvedTheme, setTheme]);

  return useMemo<ThemeContextValue>(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme, setTheme, toggleTheme],
  );
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const value = useThemeStoreValue();

  useEffect(() => {
    applyResolvedThemeToDocument(value.resolvedTheme);
  }, [value.resolvedTheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  const fallbackValue = useThemeStoreValue();
  return context ?? fallbackValue;
}

export interface ThemeToggleProps {
  className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const label = isDark ? "Chuyển sang chế độ sáng" : "Chuyển sang chế độ tối";

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={isDark}
      title={label}
      data-testid="theme-toggle"
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-300 bg-white text-slate-700 transition-colors hover:bg-slate-100 hover:text-slate-950 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-slate-50",
        className,
      )}
    >
      {isDark ? (
        <Sun className="h-5 w-5 text-amber-400" aria-hidden={true} />
      ) : (
        <Moon className="h-5 w-5" aria-hidden={true} />
      )}
    </button>
  );
}
