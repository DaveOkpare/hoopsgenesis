/* Week / month periods for the attendance screens. Weeks run Monday to Sunday. */
import type { AttendanceRanges, DateRange } from "@/features/attendance/api";
import {
  addDays,
  addMonths,
  DAYS_IN_WEEK,
  firstOfMonth,
  lastOfMonth,
  monthLabel,
  monthOf,
  rangeLabel,
  startOfWeek,
} from "@/features/calendar/dates";
import type { DateOnly } from "@/features/types";

export type PeriodKind = "week" | "month";

export function periodRange(kind: PeriodKind, at: DateOnly): DateRange {
  if (kind === "week") {
    const from = startOfWeek(at);
    return { from, to: addDays(from, DAYS_IN_WEEK - 1) };
  }
  const month = monthOf(at);
  return { from: firstOfMonth(month), to: lastOfMonth(month) };
}

/** The same period one step back or forward, as an anchor day. */
export function shiftAnchor(
  kind: PeriodKind,
  at: DateOnly,
  delta: number
): DateOnly {
  if (kind === "week") {
    return addDays(startOfWeek(at), delta * DAYS_IN_WEEK);
  }
  return firstOfMonth(addMonths(monthOf(at), delta));
}

/** The period, the one before it (for "▲ 7 pts") and the month it ends in. */
export function attendanceRanges(
  kind: PeriodKind,
  at: DateOnly
): AttendanceRanges {
  const period = periodRange(kind, at);
  const month = monthOf(period.to);
  return {
    period,
    previous: periodRange(kind, shiftAnchor(kind, at, -1)),
    month: { from: firstOfMonth(month), to: lastOfMonth(month) },
  };
}

/** "Last week, 16 to 22 Nov", "This week, 23 to 29 Nov", "November 2026". */
export function periodLabel(
  kind: PeriodKind,
  range: DateRange,
  today: DateOnly
): string {
  if (kind === "month") {
    return monthLabel(monthOf(range.from));
  }
  const thisWeek = startOfWeek(today);
  const span = rangeLabel(range.from, range.to);
  if (range.from === thisWeek) {
    return `This week, ${span}`;
  }
  if (range.from === addDays(thisWeek, -DAYS_IN_WEEK)) {
    return `Last week, ${span}`;
  }
  return `Week of ${span}`;
}

/** The word used next to a rate: "last week", "this week", "in November". */
export function periodPhrase(
  kind: PeriodKind,
  range: DateRange,
  today: DateOnly
): string {
  if (kind === "month") {
    return `in ${monthLabel(monthOf(range.from)).split(" ")[0]}`;
  }
  const label = periodLabel(kind, range, today);
  return label.startsWith("Week of")
    ? `week of ${rangeLabel(range.from, range.to)}`
    : (label.split(",")[0]?.toLowerCase() ?? "");
}

/** Minute-precision "now", so the query key doesn't change every render. */
export function minuteOf(now: Date): string {
  const MINUTE_MS = 60_000;
  return new Date(
    Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS
  ).toISOString();
}
