"use client";

import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

export interface TabItem<T extends string = string> {
  id: T;
  label: string;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<T extends string = string> {
  ariaLabel: string;
  items: readonly TabItem<T>[];
  value: T;
  onChange: (nextValue: T) => void;
  idPrefix?: string;
  /** Set false when tabs act solely as filter controls without matching TabPanel nodes. */
  hasPanels?: boolean;
  className?: string;
}

export function getTabIds(idPrefix: string, value: string): {
  tabId: string;
  panelId: string;
} {
  return {
    tabId: `${idPrefix}-tab-${value}`,
    panelId: `${idPrefix}-panel-${value}`,
  };
}

/**
 * Accessible horizontal tablist per `modern-web-guidance` `tabs`:
 * - Single non-wrapping scrollable strip (`overflow-x: auto`, never wraps rows).
 * - Roving `tabIndex` + ArrowLeft/ArrowRight/Home/End keyboard activation.
 * - Selected state indicated by `aria-selected="true"` and CSS `::after` `border-block-end`
 *   without shifting button width/font-weight.
 */
export function Tabs<T extends string = string>({
  ariaLabel,
  items,
  value,
  onChange,
  idPrefix,
  hasPanels = true,
  className,
}: TabsProps<T>) {
  const autoId = useId();
  const resolvedPrefix = idPrefix ?? autoId;
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const scrollButtonIntoView = (button: HTMLButtonElement | null) => {
    if (!button || typeof button.scrollIntoView !== "function") {
      return;
    }
    const reducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    button.scrollIntoView({
      behavior: reducedMotion ? "auto" : "smooth",
      block: "nearest",
      inline: "nearest",
    });
  };

  const activateTab = (item: TabItem<T>, focusElement: boolean) => {
    if (item.disabled) return;
    onChange(item.id);
    const targetButton = tabRefs.current[item.id] ?? null;
    if (focusElement && targetButton) {
      targetButton.focus();
    }
    scrollButtonIntoView(targetButton);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
    const enabledItems = items
      .map((item, idx) => ({ item, idx }))
      .filter(({ item }) => !item.disabled);
    if (enabledItems.length === 0) return;

    const currentEnabledPos = enabledItems.findIndex(({ idx }) => idx === currentIndex);
    if (currentEnabledPos === -1) return;

    let nextEntry: { item: TabItem<T>; idx: number } | undefined;
    if (event.key === "ArrowRight") {
      nextEntry = enabledItems[(currentEnabledPos + 1) % enabledItems.length];
    } else if (event.key === "ArrowLeft") {
      nextEntry =
        enabledItems[(currentEnabledPos - 1 + enabledItems.length) % enabledItems.length];
    } else if (event.key === "Home") {
      nextEntry = enabledItems[0];
    } else if (event.key === "End") {
      nextEntry = enabledItems[enabledItems.length - 1];
    }

    if (nextEntry) {
      event.preventDefault();
      activateTab(nextEntry.item, true);
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      aria-orientation="horizontal"
      className={cn("lms-tablist", className)}
    >
      {items.map((item, idx) => {
        const isSelected = item.id === value;
        const { tabId, panelId } = getTabIds(resolvedPrefix, item.id);
        return (
          <button
            key={item.id}
            ref={(el) => {
              tabRefs.current[item.id] = el;
            }}
            id={tabId}
            type="button"
            role="tab"
            aria-selected={isSelected}
            aria-controls={hasPanels && isSelected ? panelId : undefined}
            tabIndex={isSelected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => activateTab(item, false)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className="lms-tab"
          >
            <span>{item.label}</span>
            {typeof item.count === "number" ? (
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums",
                  isSelected
                    ? "bg-blue-100 text-blue-900"
                    : "bg-slate-100 text-slate-700",
                )}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export interface TabPanelProps {
  idPrefix: string;
  value: string;
  activeValue: string;
  children: ReactNode;
  className?: string;
}

export function TabPanel({
  idPrefix,
  value,
  activeValue,
  children,
  className,
}: TabPanelProps) {
  if (value !== activeValue) {
    return null;
  }

  const { tabId, panelId } = getTabIds(idPrefix, value);

  return (
    <div
      id={panelId}
      role="tabpanel"
      aria-labelledby={tabId}
      tabIndex={0}
      className={cn(
        "lms-tabpanel-enter rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-700",
        className,
      )}
    >
      {children}
    </div>
  );
}

