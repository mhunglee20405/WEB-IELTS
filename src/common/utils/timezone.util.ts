import { TIMEZONE_VN } from 'src/common/constants';

/**
 * Formats a UTC Date into an ISO-like string in Asia/Ho_Chi_Minh (+07:00) for display.
 * Stored timestamps in MongoDB remain UTC Date objects.
 */
export function formatVnDateTime(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_VN,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(d);

  const map: Record<string, string> = {};
  for (const p of parts) {
    map[p.type] = p.value;
  }
  const hour = map['hour'] === '24' ? '00' : map['hour'];
  return `${map['year']}-${map['month']}-${map['day']}T${hour}:${map['minute']}:${map['second']}+07:00`;
}

/**
 * Returns default daily assignment bounds in Asia/Ho_Chi_Minh (+07:00):
 * - openAt: 00:00:00.000 local (stored as UTC Date)
 * - deadlineAt: 23:59:59.999 local (stored as UTC Date)
 */
export function createVnDailyBounds(targetDate?: string | Date): { openAt: Date; deadlineAt: Date } {
  let y: number;
  let m: number;
  let d: number;

  if (typeof targetDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(targetDate.trim())) {
    const parts = targetDate.trim().split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  } else {
    const base = targetDate
      ? typeof targetDate === 'string'
        ? new Date(targetDate)
        : targetDate
      : new Date();
    const vnFormatted = formatVnDateTime(base);
    const datePart = vnFormatted.slice(0, 10);
    const parts = datePart.split('-').map(Number);
    y = parts[0];
    m = parts[1];
    d = parts[2];
  }

  // 00:00:00.000 local (+07:00) = UTC ms minus 7 hours
  const openAtUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  // 23:59:59.999 local (+07:00) = UTC ms minus 7 hours
  const deadlineAtUtcMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 7 * 60 * 60 * 1000;

  return {
    openAt: new Date(openAtUtcMs),
    deadlineAt: new Date(deadlineAtUtcMs),
  };
}

/**
 * Returns month bounds in Asia/Ho_Chi_Minh (+07:00) for quota calculations:
 * - startOfMonth: 1st day 00:00:00.000 local (stored as UTC Date)
 * - endOfMonth: last day 23:59:59.999 local (stored as UTC Date)
 */
export function createVnMonthBounds(targetDate?: string | Date): { startOfMonth: Date; endOfMonth: Date } {
  const base = targetDate
    ? typeof targetDate === 'string'
      ? new Date(targetDate)
      : targetDate
    : new Date();
  const vnFormatted = formatVnDateTime(base);
  const datePart = vnFormatted.slice(0, 10);
  const parts = datePart.split('-').map(Number);
  const y = parts[0];
  const m = parts[1];

  const lastDay = new Date(y, m, 0).getDate();

  const startUtcMs = Date.UTC(y, m - 1, 1, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const endUtcMs = Date.UTC(y, m - 1, lastDay, 23, 59, 59, 999) - 7 * 60 * 60 * 1000;

  return {
    startOfMonth: new Date(startUtcMs),
    endOfMonth: new Date(endUtcMs),
  };
}
