/*
 * The student's next session and their attendance for it (ST-2, ST-3), for Today.
 * Mock-data convention: see features/viewer/api.ts.
 */
import { FIXTURE_NOW, fixtureDelay, members, users } from "@/features/fixtures";
import { listMyAttendance } from "@/features/student-attendance/api";
import { listEvents, type StudentEvent } from "@/features/student-calendar/api";
import { addDays, toDateOnly } from "@/features/student-calendar/dates";
import type { PersonRef } from "@/features/student-records/api";
import type { AttendanceRecord, Id, Timestamp } from "@/features/types";

/** Where the student is with the session: the three Today artboards. */
export type SessionState = "upcoming" | "checked-in" | "checked-out";

export interface NextSession {
  /** The student's row for this session, once they have checked in. */
  attendance: AttendanceRecord | null;
  event: StudentEvent;
  /** Time the answer was produced (server clock), for "Starts in 19 min". */
  now: Timestamp;
  /** Who ticked the check-in ("Coach Patrick ticked you in at 16:05"). */
  verifiedBy: PersonRef | null;
}

const LOOK_AHEAD_DAYS = 14;
const TIME_ZONE = "Africa/Kigali";

/*
 * Fixture-only: each preview state is drawn at a different time on 23 Nov (the times in
 * the artboards' status bars), with the attendance row the server would have by then.
 */
const PREVIEW: Record<
  SessionState,
  { now: Timestamp; row: Partial<AttendanceRecord> | null }
> = {
  upcoming: { now: "2026-11-23T13:41:00Z", row: null },
  "checked-in": {
    now: "2026-11-23T14:20:00Z",
    row: { checkInAt: "2026-11-23T13:42:00Z" },
  },
  "checked-out": {
    now: "2026-11-23T15:41:00Z",
    row: {
      checkInAt: "2026-11-23T13:42:00Z",
      checkOutAt: "2026-11-23T15:34:00Z",
      checkOutDistanceM: 41,
      verifiedAt: "2026-11-23T14:05:00Z",
      verifiedBy: "user-patrick",
    },
  },
};

function person(userId: Id | null, academyId: Id): PersonRef | null {
  const found = users.find((u) => u.id === userId);
  if (!found) {
    return null;
  }
  const membership = members.find(
    (m) => m.userId === found.id && m.academyId === academyId
  );
  return { id: found.id, name: found.name, roles: membership?.roles ?? [] };
}

/**
 * The student's next session from today, with their attendance row for it.
 * Real: GET /events?from=today&to=today+14 and GET /me/attendance?from=&to= for that
 * day. `preview` picks a fixture state for design review; the real call ignores it.
 */
export async function getNextSession(
  academyId: Id,
  options: { preview?: SessionState } = {}
): Promise<NextSession | null> {
  const state = options.preview ?? "upcoming";
  const today = toDateOnly(FIXTURE_NOW, TIME_ZONE);
  const [{ data: upcoming }, { data: rows }] = await Promise.all([
    listEvents(academyId, { from: today, to: addDays(today, LOOK_AHEAD_DAYS) }),
    listMyAttendance(academyId, { from: today, to: today }),
    fixtureDelay(),
  ]);
  const event = upcoming.find(
    (e) =>
      e.collectAttendance &&
      e.teamId !== null &&
      !e.excludedDates.includes(e.startDate)
  );
  if (!event) {
    return null;
  }
  const { now, row } = PREVIEW[state];
  const base = rows.find((r) => r.eventId === event.id) ?? null;
  const attendance =
    base && row
      ? { ...base, verifiedAt: null, verifiedBy: null, ...row }
      : null;
  return {
    event,
    attendance,
    now,
    verifiedBy: attendance ? person(attendance.verifiedBy, academyId) : null,
  };
}
