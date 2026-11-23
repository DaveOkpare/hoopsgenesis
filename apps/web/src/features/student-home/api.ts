/*
 * The student's next session and their attendance for it (ST-2, ST-3), for Today.
 * Data-layer convention: see features/viewer/api.ts.
 */
import {
  listMyAttendance,
  type MyAttendance,
} from "@/features/student-attendance/api";
import {
  listEventOccurrences,
  loadMyTeams,
  type StudentEvent,
} from "@/features/student-calendar/api";
import { addDays, toDateOnly } from "@/features/student-calendar/dates";
import type { PersonRef } from "@/features/student-records/api";
import type { Id, Timestamp } from "@/features/types";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** Where the student is with the session: the three Today artboards. */
export type SessionState = "upcoming" | "checked-in" | "checked-out";

export interface NextSession {
  /** The student's row for this session, once they have checked in. */
  attendance: MyAttendance | null;
  /** The session: the event with `startDate` set to this session's day. */
  event: StudentEvent;
  /** Time the answer was produced, for "Starts in 19 min". */
  now: Timestamp;
  /** Who ticked the check-in ("Coach Patrick ticked you in at 16:05"). */
  verifiedBy: PersonRef | null;
}

const LOOK_AHEAD_DAYS = 14;

/**
 * The student's next team session that takes attendance, from today: one still open
 * today (its check-in window has not closed, or the student is checked in and not yet
 * out), else the first one on a later day. Calls GET /events (today .. today + 14) and
 * GET /me/attendance for today. `preview` picks a fixture state in preview mode only.
 */
export async function getNextSession(
  academyId: Id,
  options: { preview?: SessionState; timeZone: string }
): Promise<NextSession | null> {
  if (mock) {
    return (await mock()).getNextSession(academyId, options);
  }
  const now = new Date();
  const today = toDateOnly(now, options.timeZone);
  const [occurrences, { data: rows }] = await Promise.all([
    listEventOccurrences(academyId, {
      from: today,
      to: addDays(today, LOOK_AHEAD_DAYS),
    }),
    listMyAttendance(academyId, { from: today, to: today }),
  ]);
  const rowFor = (eventId: Id, date: string) =>
    rows.find((row) => row.eventId === eventId && row.sessionDate === date) ??
    null;
  const next = occurrences.find((occurrence) => {
    const { event, sessionDate, cancelled, checkInClosesAt } = occurrence;
    if (cancelled || !event.collectAttendance || event.teamId === null) {
      return false;
    }
    if (sessionDate > today) {
      return true;
    }
    const row = rowFor(event.id, sessionDate);
    const stillOpen =
      checkInClosesAt === null || Date.parse(checkInClosesAt) > now.getTime();
    return stillOpen || Boolean(row?.checkInAt && !row.checkOutAt);
  });
  if (!next) {
    return null;
  }
  const attendance = rowFor(next.event.id, next.sessionDate);
  let verifiedBy: PersonRef | null = null;
  if (attendance?.verifiedBy) {
    const people = await loadMyTeams(academyId)
      .then((teams) => teams.people)
      .catch(() => new Map<Id, PersonRef>());
    verifiedBy = {
      ...attendance.verifiedBy,
      roles: people.get(attendance.verifiedBy.id)?.roles ?? [],
    };
  }
  return {
    event: { ...next.event, startDate: next.sessionDate, endDate: null },
    attendance,
    now: now.toISOString(),
    verifiedBy,
  };
}
