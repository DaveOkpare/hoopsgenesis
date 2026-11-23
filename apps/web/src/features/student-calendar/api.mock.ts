/*
 * Preview-mode (fixture) implementation of features/student-calendar/api.ts. Dev only.
 */
import { fixtureDelay, teams, users } from "@/features/fixtures";
import type {
  EventOccurrence,
  EventRange,
  StudentEvent,
} from "@/features/student-calendar/api";
import { eachDay } from "@/features/student-calendar/dates";
import {
  cancelReasons,
  studentCalendarEvents,
  TEAM_COACH_ID,
} from "@/features/student-calendar/fixtures";
import type {
  CalendarEvent,
  Id,
  Paginated,
  UserSummary,
} from "@/features/types";

function summary(userId: Id): UserSummary | null {
  const found = users.find((u) => u.id === userId);
  if (!found) {
    return null;
  }
  const { id, name, email, image } = found;
  return { id, name, email, image };
}

function toStudentEvent(event: CalendarEvent): StudentEvent {
  const team = teams.find((t) => t.id === event.teamId);
  return {
    ...event,
    teamName: team?.name ?? null,
    coach: event.teamId ? summary(TEAM_COACH_ID) : null,
    cancelReason: cancelReasons[event.id] ?? null,
  };
}

/**
 * GET /api/v1/academies/:academyId/events?from=&to=
 * Academy-wide events plus the caller's team's events overlapping the range. Each event
 * comes back once; the client expands multi-day events into days where it needs to.
 */
export async function listEvents(
  _academyId: Id,
  range: EventRange
): Promise<Paginated<StudentEvent>> {
  await fixtureDelay();
  const data = studentCalendarEvents
    .filter(
      (event) =>
        event.startDate <= range.to &&
        (event.endDate ?? event.startDate) >= range.from
    )
    .sort(
      (a, b) =>
        a.startDate.localeCompare(b.startDate) ||
        (a.startTime ?? "").localeCompare(b.startTime ?? "")
    )
    .map(toStudentEvent);
  return { data, nextCursor: null };
}

/** Each session day of the fixture events in the range, cancelled days included. */
export async function listEventOccurrences(
  academyId: Id,
  range: EventRange
): Promise<EventOccurrence[]> {
  const { data } = await listEvents(academyId, range);
  return data.flatMap((event) => {
    const last = event.endDate ?? event.startDate;
    const from = event.startDate > range.from ? event.startDate : range.from;
    const to = last < range.to ? last : range.to;
    if (from > to) {
      return [];
    }
    return eachDay(from, to).map((sessionDate) => ({
      event,
      sessionDate,
      cancelled: event.excludedDates.includes(sessionDate),
      startsAt: null,
      endsAt: null,
      checkInOpensAt: null,
      checkInClosesAt: null,
    }));
  });
}
