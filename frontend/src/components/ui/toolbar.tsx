"use client";

import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export interface ToolbarProps {
  /** Typically filter `<Tabs>` aligned with search/select controls. */
  tabs?: ReactNode;
  /** Right-hand search inputs, selects, or compact filter actions. */
  children?: ReactNode;
  className?: string;
}

/**
 * Unified filter & search toolbar keeping tabs, selects, and search inputs
 * on a consistent 44px height row without jagged baselines.
 */
export function Toolbar({ tabs, children, className }: ToolbarProps) {
  return (
    <div className={cn("lms-toolbar", className)}>
      {tabs ? <div className="lms-toolbar-tabs">{tabs}</div> : null}
      {children ? <div className="lms-toolbar-controls">{children}</div> : null}
    </div>
  );
}

export const FilterToolbar = Toolbar;
export const FilterBar = Toolbar;
export type FilterToolbarProps = ToolbarProps;

export interface SearchInputProps {
  value: string;
  onChange: (nextValue: string) => void;
  placeholder?: string;
  label?: string;
  id?: string;
  debounceMs?: number;
  className?: string;
}

/**
 * Search field wrapped in semantic `<search>`, with leading inline search icon,
 * clear control, debounced live update, and IME-safe Enter confirmation
 * (removing redundant separate submit buttons).
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Tìm kiếm...",
  label = "Tìm kiếm",
  id,
  debounceMs = 180,
  className,
}: SearchInputProps) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [prevPropValue, setPrevPropValue] = useState(value);
  const [draft, setDraft] = useState(value);

  if (value !== prevPropValue) {
    setPrevPropValue(value);
    setDraft(value);
  }

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  const clearPendingTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const commitImmediately = (nextValue: string) => {
    clearPendingTimer();
    onChange(nextValue);
  };

  const handleInputChange = (nextValue: string) => {
    setDraft(nextValue);
    clearPendingTimer();
    if (debounceMs <= 0) {
      onChange(nextValue);
      return;
    }
    timerRef.current = setTimeout(() => {
      onChange(nextValue);
    }, debounceMs);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    commitImmediately(draft);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commitImmediately(draft);
    }
  };

  const handleClear = () => {
    setDraft("");
    commitImmediately("");
    inputRef.current?.focus();
  };

  return (
    <form
      role="search"
      aria-label={label}
      onSubmit={handleSubmit}
      className={cn("relative flex w-full items-center sm:w-auto", className)}
    >
      <label htmlFor={inputId} className="visually-hidden">
        {label}
      </label>
      <Search
        className="pointer-events-none absolute start-3 h-4 w-4 text-slate-600"
        aria-hidden={true}
      />
      <input
        ref={inputRef}
        id={inputId}
        type="search"
        value={draft}
        onChange={(event) => handleInputChange(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="none"
        spellCheck={false}
        className="h-11 w-full rounded-lg border border-slate-300 bg-white ps-9 pe-10 text-sm text-slate-900 placeholder:text-slate-600 focus-visible:border-blue-700 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-blue-700 sm:min-w-64 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {draft ? (
        <button
          type="button"
          onClick={handleClear}
          aria-label="Xóa từ khóa tìm kiếm"
          className="absolute end-1 inline-flex h-9 w-9 items-center justify-center rounded-md text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950"
        >
          <X className="h-4 w-4" aria-hidden={true} />
        </button>
      ) : null}
    </form>
  );
}
