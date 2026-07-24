/**
 * Calendar grid generation for the /calendar view. Pure functions, safe for
 * client components. All "today" comparisons use Singapore time via
 * lib/timezone.ts.
 */
import { daysInMonth, getSingaporeNow, getSingaporeToday } from '@/lib/timezone';

export interface CalendarDay {
  /** YYYY-MM-DD */
  date: string;
  /** Day of month, 1-31 */
  day: number;
  inCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  isWeekend: boolean;
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}

function toDateString(date: Date): string {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

/**
 * Builds a full calendar grid for `year`/`month` (month is 1-12): complete
 * weeks starting on Sunday, padded with leading/trailing adjacent-month days,
 * always 5 or 6 rows.
 */
export function generateCalendarGrid(year: number, month: number): CalendarDay[][] {
  const firstOfMonth = new Date(year, month - 1, 1);
  const leadingDays = firstOfMonth.getDay(); // 0 = Sunday
  const totalDays = daysInMonth(year, month);
  const rows = Math.max(5, Math.ceil((leadingDays + totalDays) / 7));
  const today = getSingaporeToday();

  const grid: CalendarDay[][] = [];
  for (let row = 0; row < rows; row += 1) {
    const week: CalendarDay[] = [];
    for (let column = 0; column < 7; column += 1) {
      const offset = row * 7 + column - leadingDays;
      const cellDate = new Date(year, month - 1, 1 + offset);
      const dateString = toDateString(cellDate);
      week.push({
        date: dateString,
        day: cellDate.getDate(),
        inCurrentMonth: cellDate.getMonth() === month - 1 && cellDate.getFullYear() === year,
        isToday: dateString === today,
        isPast: dateString < today,
        isWeekend: column === 0 || column === 6,
      });
    }
    grid.push(week);
  }
  return grid;
}

/**
 * Parses a `?month=YYYY-MM` URL parameter. Invalid or out-of-range values
 * fall back to the current Singapore month.
 */
export function parseMonthParam(value: string | null): { year: number; month: number } {
  if (value) {
    const match = /^(\d{4})-(\d{2})$/.exec(value);
    if (match) {
      const year = Number(match[1]);
      const month = Number(match[2]);
      if (year >= 1970 && year <= 2100 && month >= 1 && month <= 12) {
        return { year, month };
      }
    }
  }
  const now = getSingaporeNow();
  return { year: now.getFullYear(), month: now.getMonth() + 1 };
}

/** Formats a month value for the URL, e.g. `2026-07`. */
export function toMonthParam(year: number, month: number): string {
  return `${year}-${pad2(month)}`;
}

/** Shifts a year/month pair by `delta` months (delta may be negative). */
export function addMonths(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (((zeroBased % 12) + 12) % 12) + 1 };
}

const MONTH_LABELS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

/** Human label for a month, e.g. "July 2026". */
export function monthLabel(year: number, month: number): string {
  return `${MONTH_LABELS[month - 1]} ${year}`;
}

export const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
