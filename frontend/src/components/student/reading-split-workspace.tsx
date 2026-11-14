"use client";

import { useId, useState, type ReactNode } from "react";
import { Tabs, type TabItem } from "@/components/ui";
import { cn } from "@/lib/utils/cn";

type MobilePane = "left" | "right";

export interface ReadingSplitWorkspaceProps {
  leftLabel: string;
  rightLabel: string;
  leftTitle: string;
  leftContent: ReactNode;
  rightContent: ReactNode;
}

/**
 * Dual-pane responsive workspace (`css-layout` sticky split grid on desktop >= 1024px,
 * accessible tab toggle on mobile < 1024px without unmounting form inputs).
 */
export function ReadingSplitWorkspace({
  leftLabel,
  rightLabel,
  leftTitle,
  leftContent,
  rightContent,
}: ReadingSplitWorkspaceProps) {
  const tabsPrefix = useId();
  const [mobilePane, setMobilePane] = useState<MobilePane>("left");

  const mobileTabs: readonly TabItem<MobilePane>[] = [
    { id: "left", label: leftLabel },
    { id: "right", label: rightLabel },
  ];

  return (
    <div className="space-y-4">
      <div className="lms-split-mobile-switch">
        <Tabs
          idPrefix={tabsPrefix}
          ariaLabel="Chuyển khung hiển thị trên màn hình nhỏ"
          items={mobileTabs}
          value={mobilePane}
          onChange={setMobilePane}
          hasPanels={false}
        />
      </div>

      <div className="lms-split-grid">
        <section
          aria-label={leftTitle}
          className={cn(
            "lms-card lms-scroll-pane lms-split-left-sticky",
            mobilePane !== "left" && "lms-split-hidden-mobile",
          )}
        >
          <h2 className="border-b border-slate-200 pb-2 text-lg font-bold text-slate-900">
            {leftTitle}
          </h2>
          {leftContent}
        </section>

        <div
          className={cn(
            "space-y-4",
            mobilePane !== "right" && "lms-split-hidden-mobile",
          )}
        >
          {rightContent}
        </div>
      </div>
    </div>
  );
}

