import type { Temporal as TemporalNamespace } from "temporal-polyfill";
import { env } from "@/lib/env";

export const DEFAULT_TIMEZONE = env.NEXT_PUBLIC_DEFAULT_TIMEZONE || "Asia/Ho_Chi_Minh";
export const VN_LOCALE = "vi-VN";

type TemporalLike = typeof TemporalNamespace;

let temporalPromise: Promise<TemporalLike> | null = null;

function getNativeTemporal(): TemporalLike | undefined {
  return (globalThis as { Temporal?: TemporalLike }).Temporal;
}

/**
 * Loads the native Temporal namespace if available, otherwise dynamically loads
 * `temporal-polyfill` (~15 KB min+gz) without bundling it eagerly when native support exists.
 */
export async function ensureTemporal(): Promise<TemporalLike> {
  const existing = getNativeTemporal();
  if (existing) {
    return existing;
  }
  temporalPromise ??= import("temporal-polyfill").then((mod) => {
    (globalThis as { Temporal?: TemporalLike }).Temporal = mod.Temporal;
    return mod.Temporal;
  });
  return temporalPromise;
}

/**
 * Extracts `YYYY-MM-DD`, `HH`, `mm`, `ss` in the target IANA time zone via Intl.DateTimeFormat
 * without relying on host local timezone offsets.
 */
export function getZonedDateParts(
  input: Date | string | number,
  timeZone: string = DEFAULT_TIMEZONE,
): { year: number; month: number; day: number; hour: number; minute: number; second: number; dateKey: string } {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    throw new RangeError(`Invalid date value: ${String(input)}`);
  }

  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const year = Number(lookup.year);
  const month = Number(lookup.month);
  const day = Number(lookup.day);
  const hour = Number(lookup.hour);
  const minute = Number(lookup.minute);
  const second = Number(lookup.second);

  return {
    year,
    month,
    day,
    hour,
    minute,
    second,
    dateKey: `${lookup.year}-${lookup.month}-${lookup.day}`,
  };
}

export function formatVnDate(
  input: Date | string | number,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(VN_LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export function formatVnTime(
  input: Date | string | number,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleTimeString(VN_LOCALE, {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export function formatVnDateTime(
  input: Date | string | number,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(VN_LOCALE, {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

export interface DailyWindowUtcBounds {
  dateKey: string;
  timeZone: string;
  /** Inclusive 00:00:00 in target timezone, serialized as UTC ISO */
  startUtcIso: string;
  /** Exclusive 00:00:00 of the next day in target timezone, serialized as UTC ISO */
  endExclusiveUtcIso: string;
  /** Inclusive display end time in target timezone (`23:59`) */
  displayEndTime: string;
}

/**
 * Computes the UTC bounds for a local daily exercise window (`00:00–23:59`, exclusive `00:00` next day)
 * in `Asia/Ho_Chi_Minh` (or any explicit IANA timezone via Temporal).
 */
export async function getDailyWindowBounds(
  dateStr: string,
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<DailyWindowUtcBounds> {
  const Temporal = await ensureTemporal();
  const plainDate = Temporal.PlainDate.from(dateStr);
  const start = plainDate.toZonedDateTime({
    timeZone,
    plainTime: "00:00:00",
  });
  const endExclusive = plainDate.add({ days: 1 }).toZonedDateTime({
    timeZone,
    plainTime: "00:00:00",
  });

  return {
    dateKey: plainDate.toString(),
    timeZone,
    startUtcIso: start.toInstant().toString(),
    endExclusiveUtcIso: endExclusive.toInstant().toString(),
    displayEndTime: "23:59",
  };
}

/**
 * Synchronous Asia/Ho_Chi_Minh daily window converter (UTC+7 fixed offset; no DST in Vietnam).
 * Prefer `getDailyWindowBounds` for arbitrary DST-observing timezones.
 */
export function getVnDailyWindowSync(dateStr: string): DailyWindowUtcBounds {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  if (!match) {
    throw new RangeError(`Expected YYYY-MM-DD date string, received "${dateStr}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // 00:00:00 Asia/Ho_Chi_Minh (+07:00) corresponds to 17:00:00 UTC on the previous calendar day.
  const startMs = Date.UTC(year, month - 1, day, -7, 0, 0, 0);
  const endExclusiveMs = Date.UTC(year, month - 1, day + 1, -7, 0, 0, 0);

  return {
    dateKey: dateStr.trim(),
    timeZone: "Asia/Ho_Chi_Minh",
    startUtcIso: new Date(startMs).toISOString(),
    endExclusiveUtcIso: new Date(endExclusiveMs).toISOString(),
    displayEndTime: "23:59",
  };
}

/**
 * Resolves a local date + HH:mm event string in a target IANA time zone using Temporal
 * and detects DST ambiguity/gaps when disambiguation='reject' is checked.
 */
export async function resolveZonedEventTime(
  dateStr: string,
  timeStr: string,
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<{
  isoUtc: string;
  hasDstConflict: boolean;
  displayLocal: string;
}> {
  const Temporal = await ensureTemporal();
  const plainDate = Temporal.PlainDate.from(dateStr);
  const normalizedTime = timeStr.length === 5 ? `${timeStr}:00` : timeStr;

  let hasDstConflict = false;
  try {
    plainDate.toPlainDateTime(normalizedTime).toZonedDateTime(timeZone, {
      disambiguation: "reject",
    });
  } catch (error) {
    if (error instanceof RangeError) {
      hasDstConflict = true;
    } else {
      throw error;
    }
  }

  const resolved = plainDate
    .toPlainDateTime(normalizedTime)
    .toZonedDateTime(timeZone, { disambiguation: "compatible" });

  return {
    isoUtc: resolved.toInstant().toString(),
    hasDstConflict,
    displayLocal: resolved.toLocaleString(VN_LOCALE, {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  };
}

export interface DeadlineDifferential {
  isOverdue: boolean;
  days: number;
  hours: number;
  minutes: number;
  formattedVi: string;
  isoDuration: string;
}

/**
 * Calculates remaining or overdue duration using Temporal (`ZonedDateTime.until`)
 * and `Intl.DurationFormat` when available.
 */
export async function calculateDeadlineDifferential(
  dueAtIso: string,
  nowIso?: string,
  timeZone: string = DEFAULT_TIMEZONE,
): Promise<DeadlineDifferential> {
  const Temporal = await ensureTemporal();
  const due = Temporal.Instant.from(dueAtIso).toZonedDateTimeISO(timeZone);
  const now = nowIso
    ? Temporal.Instant.from(nowIso).toZonedDateTimeISO(timeZone)
    : Temporal.Now.zonedDateTimeISO(timeZone);

  const remaining = now.until(due, { largestUnit: "day", smallestUnit: "minute" });
  const isOverdue = remaining.sign < 0;
  const absDuration = remaining.abs();

  return {
    isOverdue,
    days: absDuration.days,
    hours: absDuration.hours,
    minutes: absDuration.minutes,
    formattedVi: formatBalancedDuration(absDuration),
    isoDuration: remaining.toString(),
  };
}

export function formatBalancedDuration(duration: {
  days?: number;
  hours?: number;
  minutes?: number;
}): string {
  const days = duration.days ?? 0;
  const hours = duration.hours ?? 0;
  const minutes = duration.minutes ?? 0;

  if (typeof Intl !== "undefined" && "DurationFormat" in Intl) {
    const DurationFormatCtor = (
      Intl as unknown as {
        DurationFormat: new (
          locale: string,
          options: { style: "long" | "short" | "narrow" | "digital" },
        ) => { format: (input: { days?: number; hours?: number; minutes?: number }) => string };
      }
    ).DurationFormat;
    const formatter = new DurationFormatCtor(VN_LOCALE, { style: "short" });
    return formatter.format({
      ...(days > 0 ? { days } : {}),
      ...(hours > 0 ? { hours } : {}),
      minutes,
    });
  }

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} ngày`);
  if (hours > 0) parts.push(`${hours} giờ`);
  if (minutes > 0 || parts.length === 0) parts.push(`${minutes} phút`);
  return parts.join(" ");
}

export function getMonthKeyInTimezone(
  input: Date | string | number,
  timeZone: string = DEFAULT_TIMEZONE,
): string {
  const parts = getZonedDateParts(input, timeZone);
  return `${parts.year}-${String(parts.month).padStart(2, "0")}`;
}

export function isPastDeadline(dueAtIso: string, nowMs: number = Date.now()): boolean {
  const dueMs = new Date(dueAtIso).getTime();
  if (Number.isNaN(dueMs)) {
    return false;
  }
  return nowMs >= dueMs;
}

/**
 * Adds a signed number of days to a `YYYY-MM-DD` date key safely using UTC calendar arithmetic.
 */
export function addDaysToDateKey(dateKey: string, deltaDays: number): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    throw new RangeError(`Expected YYYY-MM-DD date string, received "${dateKey}"`);
  }
  const utcDate = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + deltaDays),
  );
  const year = utcDate.getUTCFullYear();
  const month = String(utcDate.getUTCMonth() + 1).padStart(2, "0");
  const day = String(utcDate.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Returns the 7 Monday–Sunday `YYYY-MM-DD` keys and UTC bounds covering the target dateKey in VN time.
 */
export function getWeekRangeForDateKey(dateKey: string): {
  dateKeys: string[];
  fromUtcIso: string;
  toUtcIso: string;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    throw new RangeError(`Expected YYYY-MM-DD date string, received "${dateKey}"`);
  }
  const utcDay = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])),
  ).getUTCDay();
  const offsetFromMonday = utcDay === 0 ? -6 : 1 - utcDay;
  const mondayKey = addDaysToDateKey(dateKey, offsetFromMonday);
  const dateKeys = Array.from({ length: 7 }, (_, idx) => addDaysToDateKey(mondayKey, idx));
  const fromUtcIso = getVnDailyWindowSync(dateKeys[0]!).startUtcIso;
  const toUtcIso = getVnDailyWindowSync(dateKeys[6]!).endExclusiveUtcIso;
  return { dateKeys, fromUtcIso, toUtcIso };
}

/**
 * Returns a 6-row (or 5-row) Monday-first month calendar grid and UTC bounds in VN time.
 */
export function getMonthGridForDateKey(dateKey: string): {
  year: number;
  month: number;
  cells: Array<{ dateKey: string; inCurrentMonth: boolean }>;
  fromUtcIso: string;
  toUtcIso: string;
} {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    throw new RangeError(`Expected YYYY-MM-DD date string, received "${dateKey}"`);
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const firstDayKey = `${match[1]}-${match[2]}-01`;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const leadingEmpty = firstWeekday === 0 ? 6 : firstWeekday - 1;
  const totalSlots = Math.ceil((leadingEmpty + daysInMonth) / 7) * 7;

  const gridStartKey = addDaysToDateKey(firstDayKey, -leadingEmpty);
  const cells = Array.from({ length: totalSlots }, (_, idx) => {
    const cellKey = addDaysToDateKey(gridStartKey, idx);
    const cellMonth = Number(cellKey.slice(5, 7));
    return {
      dateKey: cellKey,
      inCurrentMonth: cellMonth === month,
    };
  });

  const lastDayKey = `${match[1]}-${match[2]}-${String(daysInMonth).padStart(2, "0")}`;
  return {
    year,
    month,
    cells,
    fromUtcIso: getVnDailyWindowSync(firstDayKey).startUtcIso,
    toUtcIso: getVnDailyWindowSync(lastDayKey).endExclusiveUtcIso,
  };
}

export function formatDateKeyVi(dateKey: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) {
    return formatVnDate(dateKey);
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}

