/*
 * Preview-mode (fixture) implementation of features/sessions/api.ts. Dev only.
 * `asOf` is the session clock (clock.ts): rows are returned as they stood at that time,
 * so one data set draws both the live and the close-out designs.
 */
import { detailEvents } from "@/features/events/fixtures";
import { academies, fixtureDelay, teams, users } from "@/features/fixtures";
import type {
  AttendanceEntryInput,
  Session,
  SessionAcademy,
  SessionAttendance,
  SessionEntry,
  SessionStatus,
} from "@/features/sessions/api";
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
  CalendarEvent,
  DateOnly,
  Id,
  Timestamp,
} from "@/features/types";

/** The preview coach (Sharika): who "by you" and ticks are attributed to. */
const PREVIEW_VIEWER = "user-sharika";

const NAMES: Record<string, string> = Object.fromEntries(
  users.map((u) => [u.id, u.name])
);

function toSessionRow(r: AttendanceRecord): SessionAttendance {
  const ref = (id: Id | null) => (id ? { id, name: NAMES[id] ?? id } : null);
  return {
    id: r.id,
    academyId: r.academyId,
    eventId: r.eventId,
    sessionDate: r.sessionDate,
    studentId: r.studentId,
    status: r.status,
    checkInAt: r.checkInAt,
    checkOutAt: r.checkOutAt,
    checkInDistanceM: r.checkInDistanceM,
    checkOutDistanceM: r.checkOutDistanceM,
    notes: r.notes,
    recordedById: r.recordedBy,
    recordedBy: ref(r.recordedBy),
    verifiedAt: r.verifiedAt,
    verifiedById: r.verifiedBy,
    verifiedBy: ref(r.verifiedBy),
    voidedAt: r.voidedAt,
  };
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

function sessionRowAsOf(
  found: AttendanceRecord | undefined,
  asOf: Date
): SessionAttendance | null {
  const row = found ? rowAsOf(found, asOf) : null;
  return row ? toSessionRow(row) : null;
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
      attendance: sessionRowAsOf(found, asOf),
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

export async function getSession(
  academy: SessionAcademy,
  eventId: Id,
  params: { date?: DateOnly; asOf: Timestamp }
): Promise<Session | null> {
  await fixtureDelay();
  const event = [...calendarEvents, ...detailEvents].find(
    (e) => e.id === eventId && e.academyId === academy.id
  );
  if (!event) {
    return null;
  }
  const asOf = new Date(params.asOf);
  return buildSession(event, params.date ?? event.startDate, asOf);
}

export async function listSessionsOn(
  academy: SessionAcademy,
  params: { date: DateOnly; teamIds: Id[]; asOf: Timestamp }
): Promise<Session[]> {
  await fixtureDelay();
  const asOf = new Date(params.asOf);
  return calendarEvents
    .filter(
      (e) =>
        e.academyId === academy.id &&
        e.startDate === params.date &&
        e.teamId !== null &&
        params.teamIds.includes(e.teamId)
    )
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((e) => buildSession(e, params.date, asOf));
}

export async function recordAttendance(
  academyId: Id,
  input: {
    eventId: Id;
    sessionDate: DateOnly;
    entries: AttendanceEntryInput[];
    asOf: Timestamp;
    idempotencyKey: string;
  }
): Promise<SessionAttendance[]> {
  await fixtureDelay();
  const recordedBy = PREVIEW_VIEWER;
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
    const id = `att-${input.eventId}-${input.sessionDate}-${entry.studentId}-${attendanceRows.length}`;
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
      recordedBy,
      // A coach recording someone by hand has seen them: count it as ticked.
      verifiedAt:
        entry.status === "present" || entry.status === "late"
          ? input.asOf
          : null,
      verifiedBy:
        entry.status === "present" || entry.status === "late"
          ? recordedBy
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
  return created.map(toSessionRow);
}

function findRow(id: Id): AttendanceRecord {
  const found = attendanceRows.find((r) => r.id === id);
  if (!found) {
    throw new Error(`Attendance ${id} not found`);
  }
  return found;
}

export async function verifyAttendance(
  _academyId: Id,
  input: { ids: Id[]; asOf: Timestamp }
): Promise<{ ids: Id[] }> {
  await fixtureDelay();
  for (const id of input.ids) {
    const found = findRow(id);
    if (
      !found.verifiedAt ||
      new Date(found.verifiedAt) > new Date(input.asOf)
    ) {
      found.verifiedAt = input.asOf;
      found.verifiedBy = PREVIEW_VIEWER;
    }
  }
  return { ids: input.ids };
}

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

/** Admin "Change": void the row, then record the new one (as api.ts does). */
export async function changeAttendance(
  academyId: Id,
  input: {
    rowId: Id;
    reason: string;
    eventId: Id;
    sessionDate: DateOnly;
    entry: AttendanceEntryInput;
    asOf: Timestamp;
    idempotencyKey: string;
  }
): Promise<SessionAttendance[]> {
  const found = findRow(input.rowId);
  found.voidedAt = input.asOf;
  found.voidedBy = PREVIEW_VIEWER;
  found.voidReason = input.reason;
  return await recordAttendance(academyId, {
    eventId: input.eventId,
    sessionDate: input.sessionDate,
    entries: [input.entry],
    asOf: input.asOf,
    idempotencyKey: input.idempotencyKey,
  });
}

export async function cancelSession(
  _academyId: Id,
  input: { eventId: Id; sessionDate: DateOnly; reason: string }
): Promise<{ eventId: Id; sessionDate: DateOnly }> {
  await fixtureDelay();
  const event = [...calendarEvents, ...detailEvents].find(
    (e) => e.id === input.eventId
  );
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
