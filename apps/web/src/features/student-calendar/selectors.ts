/* Pure helpers over student events (no data fetching). */
import {
  dayOfMonth,
  eachDay,
  monthNameShort,
} from "@/features/student-calendar/dates";
import type { StudentEvent } from "@/features/student-calendar/queries";
import type { DateOnly } from "@/features/types";
import { firstName } from "@/lib/format";

/** "U14 Training" (or "U14 · Training" with sep " · "); other events keep their title. */
export function eventTitle(event: StudentEvent, sep = " "): string {
  const named =
    event.teamName &&
    event.title.toLowerCase().startsWith(event.teamName.toLowerCase());
  if (event.eventType === "training" && event.teamName && !named) {
    return `${event.teamName}${sep}${event.title}`;
  }
  return event.title;
}

/** "16:00 – 17:30" */
export function eventTimeRange(event: StudentEvent): string {
  if (!event.startTime) {
    return "All day";
  }
  return event.endTime
    ? `${event.startTime} – ${event.endTime}`
    : event.startTime;
}

/** "Coach Patrick" */
export function eventCoach(event: StudentEvent): string | null {
  return event.coach ? `Coach ${firstName(event.coach.name)}` : null;
}

export function isMultiDay(event: StudentEvent): boolean {
  return Boolean(event.endDate && event.endDate !== event.startDate);
}

/** "5 – 7 Dec" (or "28 Nov – 2 Dec") */
export function dayRange(event: StudentEvent): string {
  const end = event.endDate ?? event.startDate;
  const sameMonth = end.slice(0, 7) === event.startDate.slice(0, 7);
  const start = sameMonth
    ? String(dayOfMonth(event.startDate))
    : `${dayOfMonth(event.startDate)} ${monthNameShort(event.startDate)}`;
  return `${start} – ${dayOfMonth(end)} ${monthNameShort(end)}`;
}

/**
 * Line under the title in the agenda: sessions that take attendance show their window,
 * other events (matches) their start time; multi-day events their days.
 */
export function agendaMeta(event: StudentEvent): string {
  if (isMultiDay(event)) {
    return `${dayRange(event)} · ${eventTimeRange(event)} daily`;
  }
  const time = event.collectAttendance
    ? eventTimeRange(event)
    : (event.startTime ?? "All day");
  return [time, event.location].filter(Boolean).join(" · ");
}

/** "16:00 · Court 2" (Today's "Coming up" rows). */
export function startAndPlace(event: StudentEvent): string {
  return [event.startTime ?? "All day", event.location]
    .filter(Boolean)
    .join(" · ");
}

export function isCancelledOn(event: StudentEvent, date: DateOnly): boolean {
  return event.excludedDates.includes(date);
}

/** Days of the event that fall between from and to. */
export function eventDays(
  event: StudentEvent,
  from: DateOnly,
  to: DateOnly
): DateOnly[] {
  const start = event.startDate > from ? event.startDate : from;
  const last = event.endDate ?? event.startDate;
  const end = last < to ? last : to;
  return start > end ? [] : eachDay(start, end);
}

/** Events grouped by the days they fall on in the range. */
export function eventsByDay(
  events: StudentEvent[],
  from: DateOnly,
  to: DateOnly
): Map<DateOnly, StudentEvent[]> {
  const byDay = new Map<DateOnly, StudentEvent[]>();
  for (const event of events) {
    for (const day of eventDays(event, from, to)) {
      const list = byDay.get(day) ?? [];
      list.push(event);
      byDay.set(day, list);
    }
  }
  return byDay;
}

/** The first day of an event that is on or after `from` (agenda shows it once). */
export function agendaDay(event: StudentEvent, from: DateOnly): DateOnly {
  return event.startDate >= from ? event.startDate : from;
}
