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
 * Returns fixed daily assignment window in Asia/Ho_Chi_Minh (+07:00):
 * - availableAt (openAt): 06:00:00.000 local on the assigned date (stored as UTC Date)
 * - dueAt (deadlineAt): 06:00:00.000 local on the following local date (stored as UTC Date, exactly 24h later)
 * - Access interval: [availableAt, dueAt)
 */
export function createVnDailyAssignmentBounds(targetDate?: string | Date): {
  availableAt: Date;
  dueAt: Date;
  openAt: Date;
  deadlineAt: Date;
  assignedDate: string;
} {
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

  // 06:00:00.000 local (+07:00) = UTC ms minus 7 hours
  const openAtUtcMs = Date.UTC(y, m - 1, d, 6, 0, 0, 0) - 7 * 60 * 60 * 1000;
  // 06:00:00.000 local (+07:00) on following local date (exactly +24h)
  const deadlineAtUtcMs = openAtUtcMs + 24 * 60 * 60 * 1000;

  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');
  const assignedDate = `${y}-${mm}-${dd}`;

  const availableAt = new Date(openAtUtcMs);
  const dueAt = new Date(deadlineAtUtcMs);

  return {
    availableAt,
    dueAt,
    openAt: availableAt,
    deadlineAt: dueAt,
    assignedDate,
  };
}

/**
 * Returns legacy daily assignment bounds in Asia/Ho_Chi_Minh (+07:00):
 * - openAt: 00:00:00.000 local on target date (stored as UTC Date)
 * - deadlineAt: 23:59:59.999 local on target date (stored as UTC Date)
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

  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0, 0) - 7 * 60 * 60 * 1000;
  const endUtcMs = Date.UTC(y, m - 1, d, 23, 59, 59, 999) - 7 * 60 * 60 * 1000;

  return {
    openAt: new Date(startUtcMs),
    deadlineAt: new Date(endUtcMs),
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
