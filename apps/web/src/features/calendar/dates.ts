/*
 * Plain-date helpers for the calendar and attendance screens. A DateOnly
 * ("YYYY-MM-DD") is a day in the academy's time zone; arithmetic runs in UTC on those
 * strings so a day never shifts. A MonthKey is "YYYY-MM".
 */
import type { DateOnly } from "@/features/types";

export type MonthKey = string;

const MS_PER_DAY = 86_400_000;
export const DAYS_IN_WEEK = 7;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_LENGTH = 10;
const MONTH_LENGTH = 7;

function utcMs(date: DateOnly): number {
  return Date.parse(`${date}T00:00:00Z`);
}

export function isMonthKey(value: unknown): value is MonthKey {
  return typeof value === "string" && MONTH_KEY.test(value);
}

export function isDateOnly(value: unknown): value is DateOnly {
  return (
    typeof value === "string" &&
    DATE_ONLY.test(value) &&
    !Number.isNaN(utcMs(value))
  );
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
  return new Date(utcMs(date) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, DATE_LENGTH);
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
  return Number(date.slice(MONTH_LENGTH + 1));
}

export function monthOf(date: DateOnly): MonthKey {
  return date.slice(0, MONTH_LENGTH);
}

export function firstOfMonth(month: MonthKey): DateOnly {
  return `${month}-01`;
}

export function addMonths(month: MonthKey, months: number): MonthKey {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  return new Date(Date.UTC(year, monthNumber - 1 + months, 1))
    .toISOString()
    .slice(0, MONTH_LENGTH);
}

export function lastOfMonth(month: MonthKey): DateOnly {
  return addDays(firstOfMonth(addMonths(month, 1)), -1);
}

/** Monday of the first week to Sunday of the last week that touch the month. */
export function monthGridRange(month: MonthKey): {
  from: DateOnly;
  to: DateOnly;
} {
  return {
    from: startOfWeek(firstOfMonth(month)),
    to: addDays(startOfWeek(lastOfMonth(month)), DAYS_IN_WEEK - 1),
  };
}

/** Every day from `from` to `to`, inclusive. */
export function eachDay(from: DateOnly, to: DateOnly): DateOnly[] {
  const days: DateOnly[] = [];
  for (let day = from; day <= to; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** The month grid as weeks of seven days (days outside the month included). */
export function gridWeeks(month: MonthKey): DateOnly[][] {
  const { from, to } = monthGridRange(month);
  const weeks: DateOnly[][] = [];
  for (let start = from; start <= to; start = addDays(start, DAYS_IN_WEEK)) {
    weeks.push(eachDay(start, addDays(start, DAYS_IN_WEEK - 1)));
  }
  return weeks;
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

/* en-GB's Intl data says "Sept"; the designs say "Sep". */
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
  return SHORT_MONTHS[Number(date.slice(5, MONTH_LENGTH)) - 1] ?? "";
}

/** "23 Nov" */
export function dayMonth(date: DateOnly): string {
  return `${dayOfMonth(date)} ${monthNameShort(date)}`;
}

/** "Mon 23 Nov" */
export function weekdayDayMonth(date: DateOnly): string {
  return `${weekdayShort(date)} ${dayMonth(date)}`;
}

/** "Tue 24" */
export function weekdayDay(date: DateOnly): string {
  return `${weekdayShort(date)} ${dayOfMonth(date)}`;
}

/** "16 to 22 Nov", or "30 Nov to 6 Dec" across months. */
export function rangeLabel(from: DateOnly, to: DateOnly): string {
  if (monthOf(from) === monthOf(to)) {
    return `${dayOfMonth(from)} to ${dayMonth(to)}`;
  }
  return `${dayMonth(from)} to ${dayMonth(to)}`;
}

/** "Mon, Wed and Fri" */
export function joinWithAnd(items: string[]): string {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

/** "HH:mm" in a time zone. */
export function timeIn(value: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}
