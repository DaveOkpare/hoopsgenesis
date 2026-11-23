/*
 * Plain-date helpers for the student calendar and attendance month grids.
 * A DateOnly ("YYYY-MM-DD") is a day in the academy's time zone; arithmetic is done in
 * UTC on those strings so a day never shifts. A MonthKey is "YYYY-MM".
 */
import type { DateOnly } from "@/features/types";

export type MonthKey = string;

const MS_PER_DAY = 86_400_000;
const DAYS_IN_WEEK = 7;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function utcMs(date: DateOnly): number {
  return Date.parse(`${date}T00:00:00Z`);
}

function fromUtcMs(ms: number): DateOnly {
  return new Date(ms).toISOString().slice(0, 10);
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_KEY.test(value);
}

export function isDateOnly(value: unknown): value is DateOnly {
  return typeof value === "string" && DATE_ONLY.test(value);
}

/** The calendar day of an instant in a time zone. */
export function toDateOnly(value: Date | string, timeZone?: string): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(typeof value === "string" ? new Date(value) : value);
}

export function addDays(date: DateOnly, days: number): DateOnly {
  return fromUtcMs(utcMs(date) + days * MS_PER_DAY);
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round((utcMs(to) - utcMs(from)) / MS_PER_DAY);
}

/** 0 = Monday … 6 = Sunday. */
export function weekdayIndex(date: DateOnly): number {
  return (new Date(utcMs(date)).getUTCDay() + DAYS_IN_WEEK - 1) % DAYS_IN_WEEK;
}

export function startOfWeek(date: DateOnly): DateOnly {
  return addDays(date, -weekdayIndex(date));
}

export function dayOfMonth(date: DateOnly): number {
  return Number(date.slice(8));
}

export function monthOf(date: DateOnly): MonthKey {
  return date.slice(0, 7);
}

export function firstOfMonth(month: MonthKey): DateOnly {
  return `${month}-01`;
}

export function addMonths(month: MonthKey, months: number): MonthKey {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + months, 1))
    .toISOString()
    .slice(0, 7);
}

export function lastOfMonth(month: MonthKey): DateOnly {
  return addDays(firstOfMonth(addMonths(month, 1)), -1);
}

/** Monday-first weeks of a month; days outside the month are null. */
export function monthWeeks(month: MonthKey): (DateOnly | null)[][] {
  const first = firstOfMonth(month);
  const last = lastOfMonth(month);
  const weeks: (DateOnly | null)[][] = [];
  let cursor = startOfWeek(first);
  while (cursor <= last) {
    const week: (DateOnly | null)[] = [];
    for (let i = 0; i < DAYS_IN_WEEK; i += 1) {
      const day = addDays(cursor, i);
      week.push(monthOf(day) === month ? day : null);
    }
    weeks.push(week);
    cursor = addDays(cursor, DAYS_IN_WEEK);
  }
  return weeks;
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: DateOnly, to: DateOnly): DateOnly[] {
  const days: DateOnly[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

function format(date: DateOnly, options: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    ...options,
  }).format(new Date(`${date}T12:00:00Z`));
}

/** "Mon" */
export function weekdayShort(date: DateOnly): string {
  return format(date, { weekday: "short" });
}

/** "Monday" */
export function weekdayLong(date: DateOnly): string {
  return format(date, { weekday: "long" });
}

/** "November 2026" */
export function monthLabel(month: MonthKey): string {
  return format(firstOfMonth(month), { month: "long", year: "numeric" });
}

/** "November" */
export function monthName(month: MonthKey): string {
  return format(firstOfMonth(month), { month: "long" });
}

/*
 * Short month names are spelled out here: en-GB's Intl data says "Sept", the designs
 * say "Sep".
 */
const SHORT_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** "Nov" (from a date or a month key) */
export function monthNameShort(date: DateOnly | MonthKey): string {
  return SHORT_MONTHS[Number(date.slice(5, 7)) - 1] ?? "";
}

/** "Nov 2026" */
export function monthShortLabel(month: MonthKey): string {
  return `${monthNameShort(month)} ${month.slice(0, 4)}`;
}

/** "3 Sep" */
export function dayMonth(date: DateOnly): string {
  return `${dayOfMonth(date)} ${monthNameShort(date)}`;
}
