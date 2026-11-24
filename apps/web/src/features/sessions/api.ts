/*
 * Sessions: one day of a calendar event that takes attendance, with its roster and
 * check-ins (CO-1, CO-3, CO-4, CO-5, CO-6, CO-7). See the convention in
 * features/viewer/api.ts; the fixture version is ./api.mock.ts (dev preview only).
 *
 * A session is not stored on the server: it is an event on one of its dates. Its
 * roster is the event team's students (GET /teams/:teamId/members), its rows come from
 * GET /attendance?eventId=&date=, and its check-in window from
 * GET /events/:id/sessions (checkInOpensAt / checkInClosesAt).
 *
 * `asOf` is the clock the status ("upcoming" / "open" / "closed") is worked out at:
 * the real time in production, the designs' morning in preview (clock.ts).
 */
import type {
  AttendanceStatus,
  CalendarEvent,
  DateOnly,
  Id,
  Team,
  Timestamp,
} from "@/features/types";
import {
  academyPath,
  apiAll,
  apiData,
  apiRaw,
  isApiError,
} from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

import { tintFor } from "./model";
import {
  addDays,
  addMinutes,
  localDate,
  WINDOW_CLOSES_AFTER_MIN,
  WINDOW_OPENS_BEFORE_MIN,
  zonedInstant,
} from "./time";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export type SessionStatus = "upcoming" | "open" | "closed" | "cancelled";

export interface PersonRef {
  id: Id;
  name: string;
}

/** One attendance row as GET /attendance returns it (voided rows are left out here). */
export interface SessionAttendance {
  academyId: Id;
  checkInAt: Timestamp | null;
  checkInDistanceM: number | null;
  checkOutAt: Timestamp | null;
  checkOutDistanceM: number | null;
  eventId: Id;
  id: Id;
  notes: string | null;
  recordedBy: PersonRef | null;
  recordedById: Id;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  studentId: Id;
  verifiedAt: Timestamp | null;
  verifiedBy: PersonRef | null;
  verifiedById: Id | null;
  voidedAt: Timestamp | null;
}

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
  attendance: SessionAttendance | null;
  student: SessionStudent;
}

export interface Session {
  academyName: string;
  /**
   * "Reason (students see this)" when the session was cancelled. The server keeps the
   * reason only in the audit log, which coaches cannot read, so it is null in real mode.
   */
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

/** Who the session screens need to know about the academy. */
export interface SessionAcademy {
  id: Id;
  name: string;
  timezone: string;
}

// ---------------------------------------------------------------- server shapes

interface ServerEvent {
  academyId: Id;
  collectAttendance: boolean;
  createdAt: Timestamp;
  createdById: Id;
  description: string | null;
  endDate: DateOnly | null;
  endTime: string | null;
  eventType: string;
  excludedDates: DateOnly[];
  id: Id;
  location: string | null;
  startDate: DateOnly;
  startTime: string | null;
  teamId: Id | null;
  title: string;
  updatedAt: Timestamp;
}

interface ServerSessionFields {
  cancelled: boolean;
  checkInClosesAt: Timestamp | null;
  checkInOpensAt: Timestamp | null;
  endsAt: Timestamp | null;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
}

/** GET /events items: the event with one session's fields. */
type ServerOccurrence = ServerEvent & ServerSessionFields;

interface RosterMember {
  image: string | null;
  name: string;
  roles: string[];
  userId: Id;
}

interface ServerAttendance extends SessionAttendance {
  student: { id: Id; name: string; image: string | null } | null;
}

interface OutstandingRow {
  daysOverdue?: number | null;
  student: { id: Id };
}

interface TeamRow {
  id: Id;
  name: string;
}

const DAYS_PER_WEEK = 7;
/** GET /events accepts at most 92 days; a series is looked up 12 weeks ahead. */
const SERIES_LOOKAHEAD_DAYS = 84;

export function toCalendarEvent(event: ServerEvent): CalendarEvent {
  return {
    id: event.id,
    academyId: event.academyId,
    teamId: event.teamId,
    eventType: event.eventType,
    title: event.title,
    description: event.description,
    location: event.location,
    startDate: event.startDate,
    endDate: event.endDate,
    startTime: event.startTime,
    endTime: event.endTime,
    excludedDates: event.excludedDates,
    collectAttendance: event.collectAttendance,
    createdBy: event.createdById,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

// ---------------------------------------------------------------- loaders

async function loadTeams(academyId: Id): Promise<Map<Id, string>> {
  const rows = await apiAll<TeamRow>(academyPath(academyId, "/teams"));
  return new Map(rows.map((t) => [t.id, t.name]));
}

async function loadRoster(academyId: Id, teamId: Id): Promise<RosterMember[]> {
  const members = await apiAll<RosterMember>(
    academyPath(academyId, `/teams/${teamId}/members`)
  );
  return members.filter((m) => m.roles.includes("student"));
}

/** Days overdue per student; an empty map when the caller may not read fees. */
async function loadOverdue(
  academyId: Id,
  teamId: Id | null
): Promise<Map<Id, number>> {
  try {
    const rows = await apiAll<OutstandingRow>(
      academyPath(academyId, "/fees/outstanding"),
      { query: { teamId } }
    );
    const result = new Map<Id, number>();
    for (const row of rows) {
      if (row.daysOverdue && row.daysOverdue > 0) {
        result.set(row.student.id, row.daysOverdue);
      }
    }
    return result;
  } catch (error) {
    if (isApiError(error) && error.status === 403) {
      return new Map();
    }
    throw error;
  }
}

function sessionStatus(
  cancelled: boolean,
  opensAt: Date,
  closesAt: Date,
  asOf: Date
): SessionStatus {
  if (cancelled) {
    return "cancelled";
  }
  if (asOf < opensAt) {
    return "upcoming";
  }
  return asOf <= closesAt ? "open" : "closed";
}

/** The check-in window: the server's when it takes attendance, else the same rule here. */
function windowOf(
  event: ServerEvent,
  fields: ServerSessionFields,
  timeZone: string
): { opensAt: Date; closesAt: Date } {
  if (fields.checkInOpensAt && fields.checkInClosesAt) {
    return {
      opensAt: new Date(fields.checkInOpensAt),
      closesAt: new Date(fields.checkInClosesAt),
    };
  }
  const start = zonedInstant(
    fields.sessionDate,
    event.startTime ?? "00:00",
    timeZone
  );
  const end = zonedInstant(
    fields.sessionDate,
    event.endTime ?? "23:59",
    timeZone
  );
  return {
    opensAt: addMinutes(start, -WINDOW_OPENS_BEFORE_MIN),
    closesAt: addMinutes(end, WINDOW_CLOSES_AFTER_MIN),
  };
}

function buildRoster(
  roster: RosterMember[],
  rows: ServerAttendance[],
  overdue: Map<Id, number>
): SessionEntry[] {
  const live = rows.filter((r) => !r.voidedAt);
  const byStudent = new Map(live.map((r) => [r.studentId, r]));
  const entries: SessionEntry[] = roster.map((m) => ({
    student: {
      id: m.userId,
      name: m.name,
      image: m.image,
      tint: tintFor(m.userId),
      feesOverdueDays: overdue.get(m.userId) ?? null,
    },
    attendance: byStudent.get(m.userId) ?? null,
  }));
  // Rows for students no longer on the team (or an academy-wide event) still show.
  const onRoster = new Set(roster.map((m) => m.userId));
  for (const row of live) {
    if (!onRoster.has(row.studentId)) {
      entries.push({
        student: {
          id: row.studentId,
          name: row.student?.name ?? "Student",
          image: row.student?.image ?? null,
          tint: tintFor(row.studentId),
          feesOverdueDays: overdue.get(row.studentId) ?? null,
        },
        attendance: row,
      });
    }
  }
  return entries;
}

/** Later weekly copies of the same event (bulk-created series share title, team and time). */
async function loadSeriesDates(
  academyId: Id,
  event: ServerEvent,
  date: DateOnly
): Promise<DateOnly[]> {
  const occurrences = await apiAll<ServerOccurrence>(
    academyPath(academyId, "/events"),
    {
      query: {
        from: date,
        to: addDays(date, SERIES_LOOKAHEAD_DAYS),
        teamId: event.teamId ?? undefined,
      },
    }
  );
  return seriesOf(occurrences, event, date).map((o) => o.sessionDate);
}

function seriesOf(
  occurrences: ServerOccurrence[],
  event: ServerEvent,
  date: DateOnly
): ServerOccurrence[] {
  return occurrences
    .filter(
      (o) =>
        o.title === event.title &&
        o.teamId === event.teamId &&
        o.startTime === event.startTime &&
        o.endDate === null &&
        o.sessionDate >= date &&
        Math.round(
          (Date.parse(o.sessionDate) - Date.parse(date)) / 86_400_000
        ) %
          DAYS_PER_WEEK ===
          0
    )
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
}

async function getEvent(
  academyId: Id,
  eventId: Id
): Promise<ServerEvent | null> {
  try {
    return await apiData<ServerEvent>(
      academyPath(academyId, `/events/${eventId}`)
    );
  } catch (error) {
    if (isApiError(error) && error.status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * One session with its roster and check-ins.
 * GET /events/:id + GET /events/:id/sessions?from=&to=&includeCancelled=true
 * + GET /teams/:teamId/members + GET /attendance?eventId=&date=
 * + GET /fees/outstanding?teamId= (the "FEES 18D" tags) + the weekly series (GET /events).
 */
export async function getSession(
  academy: SessionAcademy,
  eventId: Id,
  params: { date?: DateOnly; asOf: Timestamp }
): Promise<Session | null> {
  if (mock) {
    return (await mock()).getSession(academy, eventId, params);
  }
  const academyId = academy.id;
  const event = await getEvent(academyId, eventId);
  if (!event) {
    return null;
  }
  const asOf = new Date(params.asOf);
  const today = localDate(asOf, academy.timezone);
  const lastDay = event.endDate ?? event.startDate;
  const date =
    params.date ??
    (today >= event.startDate && today <= lastDay ? today : event.startDate);
  const [sessions, roster, rows, overdue, teams, seriesDates] =
    await Promise.all([
      apiData<ServerSessionFields[]>(
        academyPath(academyId, `/events/${eventId}/sessions`),
        { query: { from: date, to: date, includeCancelled: true } }
      ),
      event.teamId
        ? loadRoster(academyId, event.teamId)
        : Promise.resolve([] as RosterMember[]),
      apiAll<ServerAttendance>(academyPath(academyId, "/attendance"), {
        query: { eventId, date },
      }),
      loadOverdue(academyId, event.teamId),
      loadTeams(academyId),
      loadSeriesDates(academyId, event, date),
    ]);
  const [fields] = sessions;
  if (!fields) {
    return null;
  }
  const { opensAt, closesAt } = windowOf(event, fields, academy.timezone);
  const teamName = event.teamId ? teams.get(event.teamId) : undefined;
  return {
    event: toCalendarEvent(event),
    sessionDate: date,
    timeZone: academy.timezone,
    academyName: academy.name,
    team:
      event.teamId && teamName ? { id: event.teamId, name: teamName } : null,
    opensAt: opensAt.toISOString(),
    closesAt: closesAt.toISOString(),
    status: sessionStatus(fields.cancelled, opensAt, closesAt, asOf),
    roster: buildRoster(roster, rows, overdue),
    seriesDates,
    cancelReason: null,
  };
}

/**
 * The coach's team sessions on one day, in time order.
 * GET /events?from=date&to=date&includeCancelled=true, then one roster per team,
 * GET /attendance?date= and GET /fees/outstanding for all of them at once.
 */
export async function listSessionsOn(
  academy: SessionAcademy,
  params: { date: DateOnly; teamIds: Id[]; asOf: Timestamp }
): Promise<Session[]> {
  if (mock) {
    return (await mock()).listSessionsOn(academy, params);
  }
  const academyId = academy.id;
  const asOf = new Date(params.asOf);
  const occurrences = (
    await apiAll<ServerOccurrence>(academyPath(academyId, "/events"), {
      query: { from: params.date, to: params.date, includeCancelled: true },
    })
  ).filter((o) => o.teamId !== null && params.teamIds.includes(o.teamId));
  if (occurrences.length === 0) {
    return [];
  }
  const teamIds = [...new Set(occurrences.map((o) => o.teamId as Id))];
  const [rosters, rows, overdue, teams] = await Promise.all([
    Promise.all(teamIds.map((id) => loadRoster(academyId, id))),
    apiAll<ServerAttendance>(academyPath(academyId, "/attendance"), {
      query: { date: params.date },
    }),
    loadOverdue(academyId, null),
    loadTeams(academyId),
  ]);
  const rosterByTeam = new Map(
    teamIds.map((id, index) => [id, rosters[index] ?? []])
  );
  return occurrences
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((o) => {
      const teamId = o.teamId as Id;
      const { opensAt, closesAt } = windowOf(o, o, academy.timezone);
      return {
        event: toCalendarEvent(o),
        sessionDate: params.date,
        timeZone: academy.timezone,
        academyName: academy.name,
        team: { id: teamId, name: teams.get(teamId) ?? "" },
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        status: sessionStatus(o.cancelled, opensAt, closesAt, asOf),
        roster: buildRoster(
          rosterByTeam.get(teamId) ?? [],
          rows.filter((r) => r.eventId === o.id),
          overdue
        ),
        seriesDates: [],
        cancelReason: null,
      };
    });
}

/**
 * Record attendance by hand, in bulk for one session (CO-4 check in, CO-5 mark absent).
 * POST /attendance { eventId, sessionDate, entries } with an Idempotency-Key (made once
 * per user action by the caller and reused on retry). A coach recording someone present
 * or late by hand has seen them, so those rows are then ticked (POST /attendance/verify).
 */
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
  if (mock) {
    return (await mock()).recordAttendance(academyId, input);
  }
  const rows = await apiData<SessionAttendance[]>(
    academyPath(academyId, "/attendance"),
    {
      method: "POST",
      idempotencyKey: input.idempotencyKey,
      body: {
        eventId: input.eventId,
        sessionDate: input.sessionDate,
        entries: input.entries.map((entry) => ({
          studentId: entry.studentId,
          status: entry.status,
          ...(entry.checkInAt ? { checkInAt: entry.checkInAt } : {}),
          ...(entry.notes ? { notes: entry.notes } : {}),
        })),
      },
    }
  );
  const seen = rows
    .filter((r) => r.status === "present" || r.status === "late")
    .map((r) => r.id);
  if (seen.length > 0) {
    await verifyAttendance(academyId, { ids: seen, asOf: input.asOf });
  }
  return rows;
}

interface BulkVerifyResult {
  id: Id;
  result: string;
}

/**
 * Tick (verify) one or more check-ins: "I saw this student" (CO-3).
 * POST /attendance/:id/verify for one, POST /attendance/verify { ids } for "Tick all".
 * Returns the ids that are now ticked.
 */
export async function verifyAttendance(
  academyId: Id,
  input: { ids: Id[]; asOf: Timestamp }
): Promise<{ ids: Id[] }> {
  if (mock) {
    return (await mock()).verifyAttendance(academyId, input);
  }
  if (input.ids.length === 1 && input.ids[0]) {
    await apiData(
      academyPath(academyId, `/attendance/${input.ids[0]}/verify`),
      { method: "POST" }
    );
    return { ids: input.ids };
  }
  const results = await apiData<BulkVerifyResult[]>(
    academyPath(academyId, "/attendance/verify"),
    { method: "POST", body: { ids: input.ids } }
  );
  return {
    ids: results
      .filter((r) => r.result === "verified" || r.result === "unchanged")
      .map((r) => r.id),
  };
}

/**
 * Untick a mistaken tap; only while the window is open (409 `window_closed` after).
 * DELETE /attendance/:id/verify.
 */
export async function unverifyAttendance(
  academyId: Id,
  input: { id: Id }
): Promise<{ id: Id }> {
  if (mock) {
    return (await mock()).unverifyAttendance(academyId, input);
  }
  await apiRaw(academyPath(academyId, `/attendance/${input.id}/verify`), {
    method: "DELETE",
  });
  return { id: input.id };
}

/**
 * Change a recorded row (academy admins only: CO-5 "Change" after close-out). Rows are
 * append-only, so this voids the row (POST /attendance/:id/void { reason }, admin only)
 * and records the new status (POST /attendance with an Idempotency-Key). If the second
 * call fails the student is left unmarked, which the screen shows and can fix.
 */
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
  if (mock) {
    return (await mock()).changeAttendance(academyId, input);
  }
  try {
    await apiData(academyPath(academyId, `/attendance/${input.rowId}/void`), {
      method: "POST",
      body: { reason: input.reason },
    });
  } catch (error) {
    // A retry after the void went through: carry on and record.
    if (!isApiError(error, "already_voided")) {
      throw error;
    }
  }
  return await recordAttendance(academyId, {
    eventId: input.eventId,
    sessionDate: input.sessionDate,
    entries: [input.entry],
    asOf: input.asOf,
    idempotencyKey: input.idempotencyKey,
  });
}

/**
 * Cancel one day of an event (CO-6). Refused once anyone has checked in
 * (409 `attendance_exists`). POST /events/:id/sessions/:date/cancel { reason }; the
 * reason is kept in the audit log.
 */
export async function cancelSession(
  academyId: Id,
  input: { eventId: Id; sessionDate: DateOnly; reason: string }
): Promise<{ eventId: Id; sessionDate: DateOnly }> {
  if (mock) {
    return (await mock()).cancelSession(academyId, input);
  }
  await apiData(
    academyPath(
      academyId,
      `/events/${input.eventId}/sessions/${input.sessionDate}/cancel`
    ),
    {
      method: "POST",
      body: input.reason ? { reason: input.reason } : {},
    }
  );
  return { eventId: input.eventId, sessionDate: input.sessionDate };
}

/**
 * Delete the rest of a weekly series (CO-6 "Delete the whole weekly series").
 * DELETE /events/:id for each event in the series from this date on. An event that
 * already has attendance is refused by the server (409 `attendance_exists`) and kept.
 */
export async function deleteSeries(
  academyId: Id,
  input: { eventId: Id; fromDate: DateOnly }
): Promise<{ deleted: number }> {
  if (mock) {
    return (await mock()).deleteSeries(academyId, input);
  }
  const event = await getEvent(academyId, input.eventId);
  if (!event) {
    throw new Error("Session not found");
  }
  const occurrences = await apiAll<ServerOccurrence>(
    academyPath(academyId, "/events"),
    {
      query: {
        from: input.fromDate,
        to: addDays(input.fromDate, SERIES_LOOKAHEAD_DAYS),
        teamId: event.teamId ?? undefined,
      },
    }
  );
  const ids = [
    ...new Set(seriesOf(occurrences, event, input.fromDate).map((o) => o.id)),
  ];
  const outcomes = await Promise.allSettled(
    ids.map((id) =>
      apiRaw(academyPath(academyId, `/events/${id}`), { method: "DELETE" })
    )
  );
  const deleted = outcomes.filter((o) => o.status === "fulfilled").length;
  if (deleted === 0 && outcomes[0]?.status === "rejected") {
    throw outcomes[0].reason;
  }
  return { deleted };
}
