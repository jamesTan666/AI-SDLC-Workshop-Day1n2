/**
 * Singapore timezone utilities. All date/time operations in the app MUST go
 * through this module — never use `new Date()` directly elsewhere.
 *
 * Due dates are stored as naive Singapore-local strings in the format
 * `YYYY-MM-DDTHH:mm` (the same format produced by <input type="datetime-local">).
 * Strings in this format compare correctly with plain lexicographic comparison.
 */

export const SINGAPORE_TIMEZONE = 'Asia/Singapore';

export type RecurrencePatternInput = 'daily' | 'weekly' | 'monthly' | 'yearly';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SINGAPORE_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

interface DateParts {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function getSingaporeParts(date: Date): DateParts {
  const collected: Record<string, number> = {};
  for (const part of partsFormatter.formatToParts(date)) {
    if (part.type !== 'literal') {
      collected[part.type] = Number(part.value);
    }
  }
  return {
    year: collected.year,
    month: collected.month,
    day: collected.day,
    hour: collected.hour === 24 ? 0 : collected.hour,
    minute: collected.minute,
    second: collected.second,
  };
}

/**
 * Returns a Date whose year/month/day/hour/minute getters reflect the current
 * Singapore wall-clock time (a "naive" Singapore-local Date). Use this instead
 * of `new Date()` everywhere.
 */
export function getSingaporeNow(): Date {
  const parts = getSingaporeParts(new Date());
  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
}

/** Formats a naive local Date to `YYYY-MM-DDTHH:mm`. */
export function toDateTimeLocalString(date: Date): string {
  return (
    `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` +
    `T${pad2(date.getHours())}:${pad2(date.getMinutes())}`
  );
}

/** Current Singapore time as `YYYY-MM-DDTHH:mm`. */
export function getSingaporeNowString(): string {
  return toDateTimeLocalString(getSingaporeNow());
}

/** Current Singapore date as `YYYY-MM-DD`. */
export function getSingaporeToday(): string {
  return getSingaporeNowString().slice(0, 10);
}

/**
 * Parses a `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm[:ss]` Singapore-local string into
 * a naive local Date. Returns null for anything unparseable.
 */
export function parseDateTimeLocal(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour ?? 0),
    Number(minute ?? 0),
    Number(second ?? 0),
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

/** True when `value` is a valid `YYYY-MM-DDTHH:mm`-style Singapore-local string. */
export function isValidDateTimeLocal(value: string): boolean {
  return parseDateTimeLocal(value) !== null;
}

/** Adds minutes to a Singapore-local datetime string, returning the same format. */
export function addMinutesToDateTime(value: string, minutes: number): string {
  const date = parseDateTimeLocal(value);
  if (!date) {
    throw new Error(`Invalid Singapore-local datetime: ${value}`);
  }
  const shifted = new Date(date.getTime() + minutes * 60_000);
  return toDateTimeLocalString(shifted);
}

/** Number of days in a given month (1-12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/**
 * Human-readable Singapore date, e.g. "24 Jul 2026, 14:30" or "24 Jul 2026"
 * for date-only values.
 */
export function formatSingaporeDate(value: string | Date): string {
  const date = typeof value === 'string' ? parseDateTimeLocal(value) : value;
  if (!date) return String(value);
  const base = `${date.getDate()} ${MONTH_NAMES[date.getMonth()]} ${date.getFullYear()}`;
  const isDateOnly = typeof value === 'string' && value.length === 10;
  if (isDateOnly) return base;
  return `${base}, ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

/**
 * Computes the next due date for a recurring todo, preserving time of day.
 *
 * - daily: +1 day
 * - weekly: +7 days
 * - monthly: same day next month, clamped to the last day when it overflows
 *   (Jan 31 → Feb 28/29)
 * - yearly: +1 year, with Feb 29 clamped to Feb 28 on non-leap targets
 */
export function calculateNextDueDate(
  current: string,
  pattern: RecurrencePatternInput,
): string {
  const date = parseDateTimeLocal(current);
  if (!date) {
    throw new Error(`Invalid due date for recurrence: ${current}`);
  }

  if (pattern === 'daily' || pattern === 'weekly') {
    const shifted = new Date(date.getTime());
    shifted.setDate(shifted.getDate() + (pattern === 'daily' ? 1 : 7));
    return toDateTimeLocalString(shifted);
  }

  if (pattern === 'monthly') {
    const year = date.getMonth() === 11 ? date.getFullYear() + 1 : date.getFullYear();
    const month = date.getMonth() === 11 ? 1 : date.getMonth() + 2; // 1-12
    const day = Math.min(date.getDate(), daysInMonth(year, month));
    return toDateTimeLocalString(
      new Date(year, month - 1, day, date.getHours(), date.getMinutes()),
    );
  }

  const year = date.getFullYear() + 1;
  const day = Math.min(date.getDate(), daysInMonth(year, date.getMonth() + 1));
  return toDateTimeLocalString(
    new Date(year, date.getMonth(), day, date.getHours(), date.getMinutes()),
  );
}
