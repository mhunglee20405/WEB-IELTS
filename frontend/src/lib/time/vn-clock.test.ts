import { describe, expect, it } from "vitest";
import { formatVnHeaderClock, getVnIsoWeekNumber } from "./vn-clock";

describe("vn-clock utilities", () => {
  it("formats Friday UTC time into Asia/Ho_Chi_Minh HH:mm • Thứ 6 • Tuần WW • DD/MM/YYYY", () => {
    const friday = new Date("2026-11-27T06:45:00.000Z"); // 13:45 VN, Friday, ISO week 48
    const formatted = formatVnHeaderClock(friday);
    expect(formatted).toBe("13:45 • Thứ 6 • Tuần 48 • 27/11/2026");
    expect(formatted).not.toContain("GMT+7");
    expect(getVnIsoWeekNumber(friday)).toBe(48);
  });

  it("formats Sunday as 'Chủ nhật' instead of 'Thứ 1'", () => {
    const sunday = new Date("2026-11-29T05:10:00.000Z"); // 12:10 VN, Sunday, ISO week 48
    const formatted = formatVnHeaderClock(sunday);
    expect(formatted).toBe("12:10 • Chủ nhật • Tuần 48 • 29/11/2026");
    expect(formatted).not.toContain("Thứ 1");
    expect(formatted).not.toContain("GMT+7");
  });

  it("handles UTC midnight rollover into the next VN calendar day", () => {
    const rollover = new Date("2026-11-27T17:05:00.000Z"); // 00:05 VN on Saturday 28/11/2026
    const formatted = formatVnHeaderClock(rollover);
    expect(formatted).toBe("00:05 • Thứ 7 • Tuần 48 • 28/11/2026");
    expect(formatted).not.toContain("GMT+7");
  });

  it("computes ISO-8601 week 01 across year boundaries using Thursday rule", () => {
    // 2025-12-28T17:30:00.000Z -> 2025-12-29 00:30 VN (Monday of ISO week 01 of 2026)
    const week1Boundary = new Date("2025-12-28T17:30:00.000Z");
    expect(getVnIsoWeekNumber(week1Boundary)).toBe(1);
    expect(formatVnHeaderClock(week1Boundary)).toBe("00:30 • Thứ 2 • Tuần 01 • 29/12/2025");

    // 2026-01-01T02:00:00.000Z -> 2026-01-01 09:00 VN (Thursday of ISO week 01 of 2026)
    const jan1 = new Date("2026-01-01T02:00:00.000Z");
    expect(getVnIsoWeekNumber(jan1)).toBe(1);
    expect(formatVnHeaderClock(jan1)).toBe("09:00 • Thứ 5 • Tuần 01 • 01/01/2026");

    // 2023-01-01 is Sunday -> Thursday of that week is 2022-12-29 -> ISO week 52 of 2022
    const jan1Sun2023 = new Date("2023-01-01T05:00:00.000Z"); // 12:00 VN
    expect(getVnIsoWeekNumber(jan1Sun2023)).toBe(52);
    expect(formatVnHeaderClock(jan1Sun2023)).toBe("12:00 • Chủ nhật • Tuần 52 • 01/01/2023");
  });
});
