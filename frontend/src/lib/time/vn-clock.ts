import { getZonedDateParts } from "./vn-time";

export const VN_CLOCK_TIMEZONE = "Asia/Ho_Chi_Minh";

const VN_WEEKDAY_LABELS = [
  "Chủ nhật",
  "Thứ 2",
  "Thứ 3",
  "Thứ 4",
  "Thứ 5",
  "Thứ 6",
  "Thứ 7",
] as const;

/**
 * Computes the ISO-8601 week number (1..53) for the Vietnam (`Asia/Ho_Chi_Minh`)
 * calendar date corresponding to `date` using the Thursday-based ISO week rule.
 */
export function getVnIsoWeekNumber(date: Date): number {
  const { year, month, day } = getZonedDateParts(date, VN_CLOCK_TIMEZONE);
  const utcCalendar = new Date(Date.UTC(year, month - 1, day));
  const isoDay = utcCalendar.getUTCDay() || 7;
  utcCalendar.setUTCDate(utcCalendar.getUTCDate() + 4 - isoDay);
  const yearStart = new Date(Date.UTC(utcCalendar.getUTCFullYear(), 0, 1));
  return Math.ceil(((utcCalendar.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
}

/**
 * Formats a Date in Vietnam timezone (`Asia/Ho_Chi_Minh`, UTC+7) as:
 * `HH:mm • Thứ <2..7 | Chủ nhật> • Tuần <WW> • DD/MM/YYYY`
 */
export function formatVnHeaderClock(date: Date): string {
  const { year, month, day, hour, minute } = getZonedDateParts(date, VN_CLOCK_TIMEZONE);
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const weekdayLabel = VN_WEEKDAY_LABELS[dayOfWeek] ?? "Chủ nhật";
  const isoWeek = String(getVnIsoWeekNumber(date)).padStart(2, "0");

  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  const dd = String(day).padStart(2, "0");
  const mo = String(month).padStart(2, "0");
  const yyyy = String(year);

  return `${hh}:${mm} • ${weekdayLabel} • Tuần ${isoWeek} • ${dd}/${mo}/${yyyy}`;
}
