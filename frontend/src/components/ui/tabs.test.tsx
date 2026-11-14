import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { TabPanel, Tabs, type TabItem } from "./tabs";

const SAMPLE_ITEMS: readonly TabItem<"all" | "open" | "locked" | "done">[] = [
  { id: "all", label: "Tất cả", count: 5 },
  { id: "open", label: "Đang mở", count: 2 },
  { id: "locked", label: "Khóa", disabled: true },
  { id: "done", label: "Hoàn thành", count: 3 },
];

function TabsHarness() {
  const [value, setValue] = useState<"all" | "open" | "locked" | "done">("all");
  return (
    <div>
      <Tabs
        idPrefix="test-tabs"
        ariaLabel="Bộ lọc kiểm thử"
        items={SAMPLE_ITEMS}
        value={value}
        onChange={setValue}
      />
      <TabPanel idPrefix="test-tabs" value={value} activeValue={value}>
        <p>Panel:{value}</p>
      </TabPanel>
    </div>
  );
}

describe("Tabs component (modern-web-guidance tabs)", () => {
  it("exposes semantic tablist/tab/tabpanel roles and roving tabIndex", () => {
    render(<TabsHarness />);

    const tablist = screen.getByRole("tablist", { name: "Bộ lọc kiểm thử" });
    expect(tablist).toHaveAttribute("aria-orientation", "horizontal");

    const allTab = screen.getByRole("tab", { name: /Tất cả/i });
    const openTab = screen.getByRole("tab", { name: /Đang mở/i });
    expect(allTab).toHaveAttribute("aria-selected", "true");
    expect(allTab).toHaveAttribute("aria-controls", "test-tabs-panel-all");
    expect(allTab).toHaveAttribute("tabindex", "0");
    expect(openTab).toHaveAttribute("aria-selected", "false");
    expect(openTab).not.toHaveAttribute("aria-controls");
    expect(openTab).toHaveAttribute("tabindex", "-1");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel:all");
  });

  it("navigates across enabled tabs with ArrowRight/ArrowLeft/Home/End and skips disabled tabs", () => {
    render(<TabsHarness />);

    const allTab = screen.getByRole("tab", { name: /Tất cả/i });
    const openTab = screen.getByRole("tab", { name: /Đang mở/i });
    const doneTab = screen.getByRole("tab", { name: /Hoàn thành/i });

    allTab.focus();
    fireEvent.keyDown(allTab, { key: "ArrowRight" });
    expect(openTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel:open");

    // Disabled "Khóa" tab must be skipped when pressing ArrowRight from "Đang mở"
    fireEvent.keyDown(openTab, { key: "ArrowRight" });
    expect(doneTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tabpanel")).toHaveTextContent("Panel:done");

    fireEvent.keyDown(doneTab, { key: "Home" });
    expect(allTab).toHaveAttribute("aria-selected", "true");

    fireEvent.keyDown(allTab, { key: "End" });
    expect(doneTab).toHaveAttribute("aria-selected", "true");
  });
});

