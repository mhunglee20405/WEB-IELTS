import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  calculateDeadlineDifferential,
  formatDateKeyVi,
  formatVnDate,
  formatVnDateTime,
  getDailyWindowBounds,
  getMonthGridForDateKey,
  getMonthKeyInTimezone,
  getVnDailyWindowSync,
  getWeekRangeForDateKey,
  isPastDeadline,
  resolveZonedEventTime,
} from "./vn-time";

describe("vn-time utilities", () => {
  it("computes exact UTC bounds for Asia/Ho_Chi_Minh 00:00–23:59 daily window", async () => {
    const syncBounds = getVnDailyWindowSync("2026-11-12");
    expect(syncBounds.startUtcIso).toBe("2026-11-11T17:00:00.000Z");
    expect(syncBounds.endExclusiveUtcIso).toBe("2026-11-12T17:00:00.000Z");
    expect(syncBounds.displayEndTime).toBe("23:59");

    const temporalBounds = await getDailyWindowBounds("2026-11-12", "Asia/Ho_Chi_Minh");
    expect(temporalBounds.startUtcIso).toBe("2026-11-11T17:00:00Z");
    expect(temporalBounds.endExclusiveUtcIso).toBe("2026-11-12T17:00:00Z");
  });

  it("formats dates cleanly in Asia/Ho_Chi_Minh regardless of host timezone", () => {
    const iso = "2026-11-11T17:30:00.000Z"; // 00:30 on 12/11/2026 in GMT+7
    expect(formatVnDate(iso)).toBe("12/11/2026");
    expect(formatVnDateTime(iso)).toContain("12/11/2026");
    expect(formatVnDateTime(iso)).toContain("00:30");
    expect(getMonthKeyInTimezone(iso)).toBe("2026-11");
  });

  it("computes Temporal countdown and overdue differential accurately", async () => {
    const dueIso = "2026-11-12T17:00:00Z";
    const beforeDue = await calculateDeadlineDifferential(
      dueIso,
      "2026-11-12T15:30:00Z",
      "Asia/Ho_Chi_Minh",
    );
    expect(beforeDue.isOverdue).toBe(false);
    expect(beforeDue.hours).toBe(1);
    expect(beforeDue.minutes).toBe(30);

    const afterDue = await calculateDeadlineDifferential(
      dueIso,
      "2026-11-12T17:15:00Z",
      "Asia/Ho_Chi_Minh",
    );
    expect(afterDue.isOverdue).toBe(true);
    expect(afterDue.minutes).toBe(15);

    expect(isPastDeadline(dueIso, Date.parse("2026-11-12T17:00:00Z"))).toBe(true);
    expect(isPastDeadline(dueIso, Date.parse("2026-11-12T16:59:59Z"))).toBe(false);
  });

  it("detects DST transition conflicts via Temporal disambiguation='reject'", async () => {
    const springGap = await resolveZonedEventTime("2025-03-09", "02:30", "America/New_York");
    expect(springGap.hasDstConflict).toBe(true);

    const vnNormal = await resolveZonedEventTime("2026-11-12", "19:30", "Asia/Ho_Chi_Minh");
    expect(vnNormal.hasDstConflict).toBe(false);
    expect(vnNormal.isoUtc).toBe("2026-11-12T12:30:00Z");
  });

  it("computes VN calendar week ranges, month grids, and dateKey formatting accurately", () => {
    expect(addDaysToDateKey("2026-11-12", -1)).toBe("2026-11-11");
    expect(addDaysToDateKey("2026-11-30", 2)).toBe("2026-12-02");
    expect(formatDateKeyVi("2026-11-12")).toBe("12/11/2026");

    // 2026-11-12 is Thursday -> Monday 2026-11-09 through Sunday 2026-11-15
    const week = getWeekRangeForDateKey("2026-11-12");
    expect(week.dateKeys[0]).toBe("2026-11-09");
    expect(week.dateKeys[6]).toBe("2026-11-15");
    expect(week.fromUtcIso).toBe("2026-11-08T17:00:00.000Z");
    expect(week.toUtcIso).toBe("2026-11-15T17:00:00.000Z");

    const month = getMonthGridForDateKey("2026-11-12");
    expect(month.year).toBe(2026);
    expect(month.month).toBe(11);
    // 2026-11-01 is Sunday -> 6 leading days (Oct 26..31) + 30 Nov days + 6 trailing? 36 -> 42 cells (6 rows)
    expect(month.cells.length).toBe(42);
    expect(month.cells[0]?.dateKey).toBe("2026-10-26");
    expect(month.cells[0]?.inCurrentMonth).toBe(false);
    expect(month.cells[6]?.dateKey).toBe("2026-11-01");
    expect(month.cells[6]?.inCurrentMonth).toBe(true);
  });
});

