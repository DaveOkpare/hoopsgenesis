/*
 * Sessions: one day of a calendar event that takes attendance, with its roster and
 * check-ins (CO-1, CO-3, CO-4, CO-5, CO-6, CO-7). Fixture-backed; see the convention
 * in features/viewer/api.ts. Each function names the endpoint(s) it stands in for.
 *
 * Fixture-only argument: `asOf` is the session clock (clock.ts). The real API answers
 * "as of now" on the server and stamps times itself, so `asOf` disappears with the swap.
 */
import { academies, fixtureDelay, teams } from "@/features/fixtures";
import {
  attendanceRows,
  avatarTints,
  calendarEvents,
  TINT_CYCLE,
} from "@/features/sessions/fixtures";
import {
  addMinutes,
  daysBetween,
  localDate,
  WINDOW_CLOSES_AFTER_MIN,
  WINDOW_OPENS_BEFORE_MIN,
  zonedInstant,
} from "@/features/sessions/time";
import {
  academyMembers,
  outstandingFees,
} from "@/features/team-detail/fixtures";
import type {
  AttendanceRecord,
  AttendanceStatus,
  CalendarEvent,
  DateOnly,
  Id,
  Team,
  Timestamp,
} from "@/features/types";

export type SessionStatus = "upcoming" | "open" | "closed" | "cancelled";

export interface SessionStudent {
  /** Days the student's fee is overdue (GET /fees/outstanding), for the "FEES 18D" tag. */
  feesOverdueDays: number | null;
  id: Id;
  image: string | null;
  name: string;
  /** Background of the photo stand-in circle. */
  tint: string;
}

export interface SessionEntry {
  attendance: AttendanceRecord | null;
  student: SessionStudent;
}

export interface Session {
  academyName: string;
  /** "Reason (students see this)" when the session was cancelled. */
  cancelReason: string | null;
  /** Check-in closes 60 min after the end. */
  closesAt: Timestamp;
  event: CalendarEvent;
  /** Check-in opens 30 min before the start. */
  opensAt: Timestamp;
  /** Every student on the team with their row for this session, if any. */
  roster: SessionEntry[];
  /** This date and the later weekly sessions of the same series ("6 remaining Mondays"). */
  seriesDates: DateOnly[];
  sessionDate: DateOnly;
  status: SessionStatus;
  team: Pick<Team, "id" | "name"> | null;
  timeZone: string;
}

/** Status a coach can set by hand (CO-4) or at close-out (CO-5). */
export interface AttendanceEntryInput {
  checkInAt?: Timestamp;
  notes?: string;
  status: AttendanceStatus;
  studentId: Id;
}

const DAYS_PER_WEEK = 7;

/** When each fixture row was written (the API row has no created_at). */
const rowCreatedAt = new Map<Id, Timestamp>(
  attendanceRows.map((r) => [r.id, r.checkInAt ?? "2026-11-23T00:00:00Z"])
);

/** "Reason (students see this)" per cancelled session; the API stores it with the cancel. */
const cancelReasons = new Map<string, string>();

function academyOf(academyId: Id) {
  const academy = academies.find((a) => a.id === academyId);
  if (!academy) {
    throw new Error(`Academy ${academyId} not found`);
  }
  return academy;
}

function tintFor(studentId: Id): string {
  const known = avatarTints[studentId];
  if (known) {
    return known;
  }
  let hash = 0;
  for (const char of studentId) {
    hash = (hash + char.charCodeAt(0)) % TINT_CYCLE.length;
  }
  return TINT_CYCLE[hash] ?? TINT_CYCLE[0];
}

function overdueDays(studentId: Id, today: DateOnly): number | null {
  const owed = outstandingFees.find((f) => f.studentId === studentId);
  if (!owed) {
    return null;
  }
  const days = daysBetween(owed.dueDate, today);
  return days > 0 ? days : null;
}

/** The row as it stood at `asOf`: later check-ins hidden, later ticks undone. */
function rowAsOf(r: AttendanceRecord, asOf: Date): AttendanceRecord | null {
  const created = rowCreatedAt.get(r.id);
  if (r.voidedAt || (created && new Date(created) > asOf)) {
    return null;
  }
  if (r.verifiedAt && new Date(r.verifiedAt) > asOf) {
    return { ...r, verifiedAt: null, verifiedBy: null };
  }
  return r;
}

function sessionStatus(
  event: CalendarEvent,
  date: DateOnly,
  opensAt: Date,
  closesAt: Date,
  asOf: Date
): SessionStatus {
  if (event.excludedDates.includes(date)) {
    return "cancelled";
  }
  if (asOf < opensAt) {
    return "upcoming";
  }
  return asOf <= closesAt ? "open" : "closed";
}

/** Later weekly copies of the same event (bulk-created series share title, team and time). */
function seriesDatesFrom(event: CalendarEvent, date: DateOnly): DateOnly[] {
  return calendarEvents
    .filter(
      (e) =>
        e.title === event.title &&
        e.teamId === event.teamId &&
        e.startTime === event.startTime &&
        e.startDate >= date &&
        daysBetween(date, e.startDate) % DAYS_PER_WEEK === 0 &&
        !e.excludedDates.includes(e.startDate)
    )
    .map((e) => e.startDate)
    .sort();
}

function buildSession(
  event: CalendarEvent,
  date: DateOnly,
  asOf: Date
): Session {
  const academy = academyOf(event.academyId);
  const timeZone = academy.timezone;
  const start = zonedInstant(date, event.startTime ?? "00:00", timeZone);
  const end = zonedInstant(date, event.endTime ?? "23:59", timeZone);
  const opensAt = addMinutes(start, -WINDOW_OPENS_BEFORE_MIN);
  const closesAt = addMinutes(end, WINDOW_CLOSES_AFTER_MIN);
  const team = teams.find((t) => t.id === event.teamId) ?? null;
  const today = localDate(asOf, timeZone);
  const students = academyMembers.filter(
    (m) =>
      m.roles.includes("student") &&
      event.teamId !== null &&
      m.teamIds.includes(event.teamId)
  );
  const roster: SessionEntry[] = students.map((m) => {
    const found = attendanceRows.find(
      (r) =>
        r.eventId === event.id &&
        r.sessionDate === date &&
        r.studentId === m.userId
    );
    return {
      student: {
        id: m.userId,
        name: m.user.name,
        image: m.user.image,
        tint: tintFor(m.userId),
        feesOverdueDays: overdueDays(m.userId, today),
      },
      attendance: found ? rowAsOf(found, asOf) : null,
    };
  });
  return {
    event,
    sessionDate: date,
    timeZone,
    academyName: academy.name,
    team: team ? { id: team.id, name: team.name } : null,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    status: sessionStatus(event, date, opensAt, closesAt, asOf),
    roster,
    seriesDates: seriesDatesFrom(event, date),
    cancelReason: cancelReasons.get(`${event.id}:${date}`) ?? null,
  };
}

/**
 * One session with its roster and check-ins.
 * Real: GET /events/:id + GET /attendance?eventId=&date= + organization.listTeamMembers
 * + GET /fees/outstanding?teamId= (the "FEES 18D" tags).
 */
export async function getSession(
  academyId: Id,
  eventId: Id,
  params: { date?: DateOnly; asOf: Timestamp }
): Promise<Session | null> {
  await fixtureDelay();
  const event = calendarEvents.find(
    (e) => e.id === eventId && e.academyId === academyId
  );
  if (!event) {
    return null;
  }
  const asOf = new Date(params.asOf);
  return buildSession(event, params.date ?? event.startDate, asOf);
}

/**
 * The coach's sessions on one day, in time order.
 * Real: GET /events?from=&to=&teamId= (academy-wide + own teams) and
 * GET /attendance?eventId=&date= per session that takes attendance.
 */
export async function listSessionsOn(
  academyId: Id,
  params: { date: DateOnly; teamIds: Id[]; asOf: Timestamp }
): Promise<Session[]> {
  await fixtureDelay();
  const asOf = new Date(params.asOf);
  return calendarEvents
    .filter(
      (e) =>
        e.academyId === academyId &&
        e.startDate === params.date &&
        e.teamId !== null &&
        params.teamIds.includes(e.teamId)
    )
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((e) => buildSession(e, params.date, asOf));
}

/**
 * Record attendance by hand, in bulk for one session (CO-4 check in, CO-5 mark absent).
 * Real: POST /attendance { eventId, sessionDate, entries } with an Idempotency-Key.
 */
export async function recordAttendance(
  academyId: Id,
  input: {
    eventId: Id;
    sessionDate: DateOnly;
    entries: AttendanceEntryInput[];
    recordedBy: Id;
    asOf: Timestamp;
  }
): Promise<AttendanceRecord[]> {
  await fixtureDelay();
  const created: AttendanceRecord[] = [];
  for (const entry of input.entries) {
    const exists = attendanceRows.some(
      (r) =>
        r.eventId === input.eventId &&
        r.sessionDate === input.sessionDate &&
        r.studentId === entry.studentId &&
        !r.voidedAt
    );
    if (exists) {
      throw new Error("This student already has attendance for this session.");
    }
    const id = `att-${input.eventId}-${input.sessionDate}-${entry.studentId}`;
    const record: AttendanceRecord = {
      id,
      academyId,
      eventId: input.eventId,
      sessionDate: input.sessionDate,
      studentId: entry.studentId,
      status: entry.status,
      checkInAt: entry.checkInAt ?? null,
      checkInDistanceM: null,
      checkOutAt: null,
      checkOutDistanceM: null,
      recordedBy: input.recordedBy,
      // A coach recording someone by hand has seen them: count it as ticked.
      verifiedAt:
        entry.status === "present" || entry.status === "late"
          ? input.asOf
          : null,
      verifiedBy:
        entry.status === "present" || entry.status === "late"
          ? input.recordedBy
          : null,
      voidedAt: null,
      voidedBy: null,
      voidReason: null,
      notes: entry.notes ?? null,
    };
    rowCreatedAt.set(id, input.asOf);
    attendanceRows.push(record);
    created.push(record);
  }
  return created;
}

function findRow(id: Id): AttendanceRecord {
  const found = attendanceRows.find((r) => r.id === id);
  if (!found) {
    throw new Error(`Attendance ${id} not found`);
  }
  return found;
}

/**
 * Tick (verify) one or more check-ins: "I saw this student" (CO-3).
 * Real: POST /attendance/:id/verify, or POST /attendance/verify { ids } for "Tick all".
 */
export async function verifyAttendance(
  _academyId: Id,
  input: { ids: Id[]; verifiedBy: Id; asOf: Timestamp }
): Promise<{ ids: Id[] }> {
  await fixtureDelay();
  for (const id of input.ids) {
    const found = findRow(id);
    if (
      !found.verifiedAt ||
      new Date(found.verifiedAt) > new Date(input.asOf)
    ) {
      found.verifiedAt = input.asOf;
      found.verifiedBy = input.verifiedBy;
    }
  }
  return { ids: input.ids };
}

/**
 * Untick a mistaken tap; only while the window is open (the server answers 409 after).
 * Real: DELETE /attendance/:id/verify.
 */
export async function unverifyAttendance(
  _academyId: Id,
  input: { id: Id }
): Promise<{ id: Id }> {
  await fixtureDelay();
  const found = findRow(input.id);
  found.verifiedAt = null;
  found.verifiedBy = null;
  return { id: input.id };
}

/**
 * Cancel one day of an event (CO-6). Refused once anyone has checked in.
 * Real: POST /events/:id/sessions/:date/cancel. The reason travels with it so
 * the students' notification can show it.
 */
export async function cancelSession(
  _academyId: Id,
  input: { eventId: Id; sessionDate: DateOnly; reason: string }
): Promise<{ eventId: Id; sessionDate: DateOnly }> {
  await fixtureDelay();
  const event = calendarEvents.find((e) => e.id === input.eventId);
  if (!event) {
    throw new Error("Session not found");
  }
  const hasAttendance = attendanceRows.some(
    (r) =>
      r.eventId === input.eventId &&
      r.sessionDate === input.sessionDate &&
      !r.voidedAt
  );
  if (hasAttendance) {
    throw new Error("Someone has already checked in to this session.");
  }
  event.excludedDates.push(input.sessionDate);
  cancelReasons.set(`${input.eventId}:${input.sessionDate}`, input.reason);
  return { eventId: input.eventId, sessionDate: input.sessionDate };
}

/**
 * Delete the rest of a weekly series (CO-6 "Delete the whole weekly series").
 * Real: DELETE /events/:id for each event in the series from this date on.
 */
export async function deleteSeries(
  _academyId: Id,
  input: { eventId: Id; fromDate: DateOnly }
): Promise<{ deleted: number }> {
  await fixtureDelay();
  const event = calendarEvents.find((e) => e.id === input.eventId);
  if (!event) {
    throw new Error("Session not found");
  }
  const dates = new Set(seriesDatesFrom(event, input.fromDate));
  let deleted = 0;
  for (let i = calendarEvents.length - 1; i >= 0; i -= 1) {
    const e = calendarEvents[i];
    if (
      e &&
      e.title === event.title &&
      e.teamId === event.teamId &&
      e.startTime === event.startTime &&
      dates.has(e.startDate)
    ) {
      calendarEvents.splice(i, 1);
      deleted += 1;
    }
  }
  return { deleted };
}
