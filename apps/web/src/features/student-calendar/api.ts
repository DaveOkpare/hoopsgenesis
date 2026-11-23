/*
 * Student calendar data (ST-8). Follows the mock-data convention in features/viewer/api.ts:
 * fixtures today, the real endpoints later; only this file changes.
 */
import { FIXTURE_NOW, fixtureDelay, teams, users } from "@/features/fixtures";
import {
  cancelReasons,
  studentCalendarEvents,
  TEAM_COACH_ID,
} from "@/features/student-calendar/fixtures";
import type {
  CalendarEvent,
  DateOnly,
  Id,
  Paginated,
  UserSummary,
} from "@/features/types";

/**
 * An event as the student calendar shows it. `teamName` and `coach` are joined for
 * display (assumed to come back with GET /events); `cancelReason` is the note a coach
 * gives when cancelling a session (CO-6), which the schema does not store yet.
 */
export interface StudentEvent extends CalendarEvent {
  cancelReason: string | null;
  coach: UserSummary | null;
  teamName: string | null;
}

export interface EventRange {
  from: DateOnly;
  to: DateOnly;
}

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
 * The academy's "now". Real: `new Date()`. Fixtures pin it to the moment the designs
 * are drawn at (Mon 23 Nov 2026, 10:02 in Kigali).
 */
export function academyNow(): Date {
  return FIXTURE_NOW;
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
