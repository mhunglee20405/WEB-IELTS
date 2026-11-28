import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  ThemeToggle,
  useTheme,
} from "./theme-provider";

function ThemeInspector() {
  const { theme, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-pref">{theme}</span>
      <span data-testid="theme-resolved">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme("system")}>
        Theo hệ thống
      </button>
      <ThemeToggle />
    </div>
  );
}

describe("ThemeProvider & ThemeToggle", () => {
  const originalMatchMedia = window.matchMedia;

  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = "";
  });

  afterEach(() => {
    window.matchMedia = originalMatchMedia;
  });

  it("defaults to light mode and toggles dark/light while persisting to localStorage", async () => {
    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-pref")).toHaveTextContent("light");
    expect(screen.getByTestId("theme-resolved")).toHaveTextContent("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");

    const toggleBtn = screen.getByRole("button", { name: /chế độ|giao diện/i });
    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(screen.getByTestId("theme-pref")).toHaveTextContent("dark");
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    });

    fireEvent.click(screen.getByRole("button", { name: /chế độ|giao diện/i }));

    await waitFor(() => {
      expect(screen.getByTestId("theme-pref")).toHaveTextContent("light");
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
      expect(document.documentElement.style.colorScheme).toBe("light");
      expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    });
  });

  it("restores 'dark' preference from localStorage on initial load", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "dark");

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-pref")).toHaveTextContent("dark");
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
      expect(document.documentElement.style.colorScheme).toBe("dark");
    });
  });

  it("handles missing window.matchMedia safely and supports system preference when present", async () => {
    // Missing matchMedia in jsdom should not throw when theme is system
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: undefined,
    });

    window.localStorage.setItem(THEME_STORAGE_KEY, "system");
    const { unmount } = render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-pref")).toHaveTextContent("system");
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("light");
    });
    unmount();

    // Mock dark OS preference via matchMedia
    const changeRef: { current: ((event: { matches: boolean }) => void) | null } = {
      current: null,
    };
    const matchMediaMock = vi.fn().mockImplementation(() => ({
      matches: true,
      media: "(prefers-color-scheme: dark)",
      addEventListener: (_event: string, cb: (event: { matches: boolean }) => void) => {
        changeRef.current = cb;
      },
      removeEventListener: vi.fn(),
    }));
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      configurable: true,
      value: matchMediaMock,
    });

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("dark");
      expect(document.documentElement.classList.contains("dark")).toBe(true);
    });

    expect(changeRef.current).not.toBeNull();
    changeRef.current?.({ matches: false });
    await waitFor(() => {
      expect(screen.getByTestId("theme-resolved")).toHaveTextContent("light");
      expect(document.documentElement.classList.contains("dark")).toBe(false);
    });
  });
});
