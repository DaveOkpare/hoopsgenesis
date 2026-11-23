/*
 * Wall-clock helpers for sessions. Event dates and times are local to the academy
 * ("2026-11-23", "07:00" in Africa/Kigali); these turn them into instants and back.
 */
import type { DateOnly, TimeOfDay } from "@/features/types";

const MS_PER_MINUTE = 60_000;
const MS_PER_DAY = 86_400_000;
const OFFSET = /GMT([+-])(\d{2}):?(\d{2})?/;

/** The time zone's UTC offset in minutes at a given instant (e.g. Kigali = +120). */
function offsetMinutes(at: Date, timeZone: string): number {
  const name =
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      timeZoneName: "longOffset",
    })
      .formatToParts(at)
      .find((part) => part.type === "timeZoneName")?.value ?? "GMT";
  const match = OFFSET.exec(name);
  if (!match) {
    return 0;
  }
  const sign = match[1] === "-" ? -1 : 1;
  return sign * (Number(match[2]) * 60 + Number(match[3] ?? 0));
}

/** "2026-11-23" + "07:00" in the academy zone -> the instant. */
export function zonedInstant(
  date: DateOnly,
  time: TimeOfDay,
  timeZone: string
): Date {
  const naive = new Date(`${date}T${time}:00Z`);
  return new Date(
    naive.getTime() - offsetMinutes(naive, timeZone) * MS_PER_MINUTE
  );
}

/** The academy-local calendar date of an instant. */
export function localDate(at: Date, timeZone: string): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** The academy-local "HH:mm" of an instant. */
export function localTime(at: Date, timeZone: string): TimeOfDay {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
}

export function addMinutes(at: Date, minutes: number): Date {
  return new Date(at.getTime() + minutes * MS_PER_MINUTE);
}

/** "2026-11-25" + 7 days -> "2026-12-02". */
export function addDays(date: DateOnly, days: number): DateOnly {
  const base = new Date(`${date}T12:00:00Z`).getTime();
  return new Date(base + days * MS_PER_DAY).toISOString().slice(0, 10);
}

/** Whole days from `from` to `to` (plain dates). */
export function daysBetween(from: DateOnly, to: DateOnly): number {
  return Math.round(
    (new Date(`${to}T12:00:00Z`).getTime() -
      new Date(`${from}T12:00:00Z`).getTime()) /
      MS_PER_DAY
  );
}

/** "Wed 25 Nov" for a plain date. */
export function formatWeekdayDayMonth(date: DateOnly): string {
  const value = new Date(`${date}T12:00:00Z`);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  }).format(value);
  const dayMonth = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(value);
  return `${weekday} ${dayMonth}`;
}

/** Session window: check-in opens 30 min before the start and closes 60 min after the end. */
export const WINDOW_OPENS_BEFORE_MIN = 30;
export const WINDOW_CLOSES_AFTER_MIN = 60;
