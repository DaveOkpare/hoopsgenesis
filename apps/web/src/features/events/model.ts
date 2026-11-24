/* Pure labels and splits for the event detail screens. Safe to use in components. */
import type { EventDetail, EventSessionItem } from "@/features/events/api";
import { daysBetween, formatWeekdayDayMonth } from "@/features/sessions/time";
import type { DateOnly, TimeOfDay } from "@/features/types";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const MONTHS = [
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
const ISO_DAY_START = 8;
const ISO_MONTH_START = 5;

function utc(date: DateOnly): Date {
  return new Date(`${date}T12:00:00Z`);
}

/** "Mon" */
export function weekdayShort(date: DateOnly): string {
  return WEEKDAYS[utc(date).getUTCDay()] ?? "";
}

/** "Monday" */
export function weekdayLong(date: DateOnly): string {
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(utc(date));
}

/** "Nov" */
export function monthShort(date: DateOnly): string {
  return (
    MONTHS[Number(date.slice(ISO_MONTH_START, ISO_MONTH_START + 2)) - 1] ?? ""
  );
}

/** "23" */
export function dayNumber(date: DateOnly): string {
  return String(Number(date.slice(ISO_DAY_START)));
}

/** "16 Dec" */
export function dayMonth(date: DateOnly): string {
  return `${dayNumber(date)} ${monthShort(date)}`;
}

/** "Wed 18 Nov" */
export const shortDate = formatWeekdayDayMonth;

/** "Monday 23 November" */
export function longDate(date: DateOnly): string {
  const month = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(utc(date));
  return `${weekdayLong(date)} ${dayNumber(date)} ${month}`;
}

/** "15:30 to 17:00", or "All day". */
export function timesLabel(
  start: TimeOfDay | null,
  end: TimeOfDay | null
): string {
  if (!start) {
    return "All day";
  }
  return end ? `${start} to ${end}` : start;
}

/** "Mon and Wed", "Mon, Tue and Thu". */
export function joinWords(words: string[]): string {
  if (words.length <= 1) {
    return words[0] ?? "";
  }
  return `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** The weekdays a series meets on, Monday first. */
export function weekdaysOf(dates: DateOnly[]): string[] {
  const days = new Set(dates.map((d) => utc(d).getUTCDay()));
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.filter((d) => days.has(d)).map((d) => WEEKDAYS[d] ?? "");
}

/** "Training", "Match" */
export function typeLabel(eventType: string): string {
  return `${eventType.charAt(0).toUpperCase()}${eventType.slice(1)}`;
}

/** "TRAINING · TAKES ATTENDANCE" / "CAMP · ATTENDANCE EACH DAY" (shown uppercase). */
export function eyebrow(detail: Pick<EventDetail, "event" | "kind">): string {
  const type = typeLabel(detail.event.eventType);
  if (!detail.event.collectAttendance) {
    return type;
  }
  return `${type} · ${detail.kind === "days" ? "Attendance each day" : "Takes attendance"}`;
}

/** Details "When": "Mon and Wed, 15:30 to 17:00" / "14 to 16 Dec, 3 days" / "Mon 23 Nov, 15:30 to 17:00". */
export function whenLabel(detail: EventDetail): string {
  const { event, kind, sessions } = detail;
  const times = timesLabel(event.startTime, event.endTime);
  if (kind === "series") {
    return `${joinWords(weekdaysOf(sessions.map((s) => s.date)))}, ${times}`;
  }
  if (kind === "days" && event.endDate) {
    const days = daysBetween(event.startDate, event.endDate) + 1;
    const sameMonth = monthShort(event.startDate) === monthShort(event.endDate);
    const first = sameMonth
      ? dayNumber(event.startDate)
      : dayMonth(event.startDate);
    return `${first} to ${dayMonth(event.endDate)}, ${days} days`;
  }
  return `${shortDate(event.startDate)}, ${times}`;
}

/** "Weekly until 16 Dec" (series only). */
export function repeatsLabel(dates: DateOnly[]): string | null {
  const last = [...dates].sort().at(-1);
  return last ? `Weekly until ${dayMonth(last)}` : null;
}

/** "Coach Patrick" from "Patrick Habimana". */
export function coachName(name: string): string {
  return `Coach ${name.split(" ")[0] ?? name}`;
}

/** Splits sessions into those still to come (today included) and those past, newest first. */
export function splitSessions(
  sessions: EventSessionItem[],
  today: DateOnly
): { upcoming: EventSessionItem[]; past: EventSessionItem[] } {
  return {
    upcoming: sessions.filter((s) => s.date >= today),
    past: sessions
      .filter((s) => s.date < today && !s.cancelled)
      .sort((a, b) => b.date.localeCompare(a.date)),
  };
}

const PERCENT = 100;

/** "86% attendance in November": present or late over everyone, past sessions this month. */
export function monthAttendance(
  past: EventSessionItem[],
  today: DateOnly
): { percent: number; month: string } | null {
  const month = today.slice(0, ISO_DAY_START - 1);
  let came = 0;
  let total = 0;
  for (const s of past) {
    if (!(s.tally && s.date.startsWith(month))) {
      continue;
    }
    const t = s.tally;
    came += t.present + t.late;
    total += t.present + t.late + t.absent + t.excused + (t.notMarked ?? 0);
  }
  if (total === 0) {
    return null;
  }
  const name = new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(utc(today));
  return { percent: Math.round((came / total) * PERCENT), month: name };
}

/** A past session is closed out when nobody on the team is left unmarked. */
export function isClosedOut(session: EventSessionItem): boolean {
  return session.tally !== null && (session.tally.notMarked ?? 0) === 0;
}

/** "Cancelled by Coach Patrick: court closed for repairs" / "Cancelled". */
export function cancelledLine(
  session: EventSessionItem,
  withName: boolean
): string {
  const who =
    withName && session.cancelledBy ? ` by ${session.cancelledBy}` : "";
  const why = session.cancelReason ? `: ${session.cancelReason}` : "";
  return `Cancelled${who}${why}`;
}
