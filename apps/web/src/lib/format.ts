/*
 * Shared formatters. Output matches the copy in the designs:
 *   formatMoney({ amount: "30000.00", currency: "RWF" })      -> "RWF 30,000"
 *   formatAmount("420000.00")                                  -> "420,000" (for stat tiles)
 *   formatDayMonth("2026-11-23")                               -> "23 Nov"
 *   formatLongDate(now, tz)                                    -> "Monday, 23 November"
 *   formatShortWeekdayDate(now, tz)                            -> "Monday, 23 Nov" (phone eyebrow)
 *   formatMonthYear("2026-11-01")                              -> "November 2026"
 *   formatShortMonthYear("2026-11-01")                         -> "Nov 2026"
 *   formatTime("2026-11-23T07:14:00Z", "Africa/Kigali")        -> "09:14"
 *   formatRelativeDay(ts, tz, now)                             -> "Today" | "Yesterday" | "Fri" | "16 Nov"
 *   formatDaysAgo(ts, now)                                     -> "3 days"
 *   greeting(now, tz)                                          -> "Good morning"
 *   initials("Sharika D.")                                     -> "SD"
 * Dates are rendered in the academy's time zone; pass `academy.timezone`.
 * Pass `now` explicitly (FIXTURE_NOW in fixtures) when you need the design's "today".
 */
import type { Money } from "@/features/types";

const LOCALE = "en-GB";
const MS_PER_DAY = 86_400_000;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;
const WHITESPACE = /\s+/;

/** Plain "YYYY-MM-DD" dates are read as noon UTC so they never shift a day. */
function toDate(value: Date | string): Date {
  if (value instanceof Date) {
    return value;
  }
  return new Date(PLAIN_DATE.test(value) ? `${value}T12:00:00Z` : value);
}

function parts(
  value: Date | string,
  timeZone: string | undefined,
  options: Intl.DateTimeFormatOptions
) {
  // en-GB abbreviates September as "Sept"; the designs use "Sep".
  return new Intl.DateTimeFormat(LOCALE, { timeZone, ...options })
    .format(toDate(value))
    .replace("Sept", "Sep");
}

export function formatAmount(amount: string | number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(
    Number(amount)
  );
}

export function formatMoney({ amount, currency }: Money): string {
  return `${currency} ${formatAmount(amount)}`;
}

export function formatDayMonth(
  value: Date | string,
  timeZone?: string
): string {
  return parts(value, timeZone, { day: "numeric", month: "short" });
}

export function formatLongDate(
  value: Date | string,
  timeZone?: string
): string {
  const weekday = parts(value, timeZone, { weekday: "long" });
  return `${weekday}, ${parts(value, timeZone, { day: "numeric", month: "long" })}`;
}

export function formatShortWeekdayDate(
  value: Date | string,
  timeZone?: string
): string {
  const weekday = parts(value, timeZone, { weekday: "long" });
  return `${weekday}, ${formatDayMonth(value, timeZone)}`;
}

export function formatMonthYear(
  value: Date | string,
  timeZone?: string
): string {
  return parts(value, timeZone, { month: "long", year: "numeric" });
}

export function formatShortMonthYear(
  value: Date | string,
  timeZone?: string
): string {
  return parts(value, timeZone, { month: "short", year: "numeric" });
}

export function formatTime(value: Date | string, timeZone?: string): string {
  return parts(value, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
}

function calendarDay(value: Date | string, timeZone?: string): number {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(toDate(value));
  return Date.parse(`${iso}T00:00:00Z`) / MS_PER_DAY;
}

const DAYS_IN_WEEK = 7;

export function formatRelativeDay(
  value: Date | string,
  timeZone?: string,
  now: Date = new Date()
): string {
  const diff = calendarDay(now, timeZone) - calendarDay(value, timeZone);
  if (diff === 0) {
    return "Today";
  }
  if (diff === 1) {
    return "Yesterday";
  }
  if (diff > 1 && diff < DAYS_IN_WEEK) {
    return parts(value, timeZone, { weekday: "short" });
  }
  return formatDayMonth(value, timeZone);
}

export function formatDaysAgo(
  value: Date | string,
  now: Date = new Date()
): string {
  const days = Math.max(
    0,
    Math.floor((now.getTime() - toDate(value).getTime()) / MS_PER_DAY)
  );
  return days === 1 ? "1 day" : `${days} days`;
}

const NOON = 12;
const EVENING = 17;

export function greeting(now: Date = new Date(), timeZone?: string): string {
  const hour = Number(
    parts(now, timeZone, { hour: "2-digit", hourCycle: "h23" })
  );
  if (hour < NOON) {
    return "Good morning";
  }
  return hour < EVENING ? "Good afternoon" : "Good evening";
}

export function initials(name: string): string {
  const words = name
    .replace(/\./g, "")
    .trim()
    .split(WHITESPACE)
    .filter(Boolean);
  const first = words.at(0)?.[0] ?? "";
  const last = words.length > 1 ? (words.at(-1)?.[0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

/** First name for greetings ("Good morning, Sharika"). */
export function firstName(name: string): string {
  return name.trim().split(WHITESPACE)[0] ?? name;
}
