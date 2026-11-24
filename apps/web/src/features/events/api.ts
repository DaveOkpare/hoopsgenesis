/*
 * Calendar events: create (CO-2), event detail for staff (CO-2, CO-6) and the student's
 * view of one day of an event (ST-8, ST-4). See the convention in features/viewer/api.ts;
 * the fixture version is ./api.mock.ts (dev preview only).
 *
 * "Repeat weekly until" has no recurrence rule in the API: the app creates one event per
 * week in one go (createEvents). So what the designs call one weekly event ("Mon and Wed,
 * weekly until 16 Dec") is, on the server, several one-day events with the same title,
 * team, type and times. The detail screens put that series back together from
 * GET /events (findSeries) and act on each of its events: edit and delete touch the
 * events still to come, cancel touches one day.
 */
import { deletesWholeEvent, hasCheckIns } from "@/features/events/model";
import { addDays, daysBetween } from "@/features/sessions/time";
import type {
  AttendanceStatus,
  CalendarEvent,
  DateOnly,
  Id,
  TimeOfDay,
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

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** The types this form offers; the server accepts these and a few more. */
export type EventType = "training" | "match" | "camp" | "other";

/** POST /events body. */
export interface CreateEventInput {
  collectAttendance: boolean;
  description?: string;
  endDate?: DateOnly;
  endTime: TimeOfDay;
  eventType: EventType;
  location: string;
  startDate: DateOnly;
  startTime: TimeOfDay;
  teamId: Id;
  title: string;
}

/** The fields an edit may change (PATCH /events/:id). */
export interface EventChanges {
  collectAttendance?: boolean;
  endDate?: DateOnly | null;
  endTime?: TimeOfDay;
  eventType?: string;
  location?: string | null;
  startDate?: DateOnly;
  startTime?: TimeOfDay;
  teamId?: Id;
  title?: string;
}

interface ServerEvent extends Omit<CalendarEvent, "createdBy"> {
  createdById: Id;
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

interface TeamRow {
  id: Id;
  name: string;
  studentCount?: number;
}

interface AttendanceRow {
  eventId: Id;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  studentId: Id;
  voidedAt: Timestamp | null;
}

interface AuditRow {
  actor: { id: Id; name: string } | null;
  after: { excludedDates?: string[] } | null;
  before: { excludedDates?: string[] } | null;
  reason: string | null;
}

/** Who an event detail is for: the academy and what the caller may read. */
export interface EventViewer {
  academyId: Id;
  /** Academy admin: may read the activity log (cancel reasons). */
  isAdmin: boolean;
  /** Admin or coach: may read attendance (past session counts). */
  isStaff: boolean;
  timeZone: string;
  /** "Today" in the academy, for splitting coming up from past. */
  today: DateOnly;
  userId: Id;
}

/** Attendance of one session, for the "Past sessions" table. */
export interface SessionTally {
  absent: number;
  excused: number;
  late: number;
  /** On the team with no row (null for an academy-wide event: no roster). */
  notMarked: number | null;
  present: number;
}

/** One dated session of the event (or of its weekly series). */
export interface EventSessionItem {
  cancelled: boolean;
  /** Who cancelled it and why: from the activity log, so academy admins only. */
  cancelledBy: string | null;
  cancelReason: string | null;
  checkInClosesAt: Timestamp | null;
  checkInOpensAt: Timestamp | null;
  date: DateOnly;
  endTime: TimeOfDay | null;
  /** The server event this date belongs to (series dates are separate events). */
  eventId: Id;
  location: string | null;
  startTime: TimeOfDay | null;
  /** Staff, past or today, attendance taken; else null. */
  tally: SessionTally | null;
}

export type EventKind = "single" | "days" | "series";

export interface EventDetail {
  coaches: string[];
  /** The creator's name when we can tell it (team roster or the caller). */
  creatorName: string | null;
  event: CalendarEvent;
  /** single: one day. days: one event over several days (a camp). series: weekly copies. */
  kind: EventKind;
  /** Every server event of the series (just the event itself otherwise). */
  seriesEventIds: Id[];
  sessions: EventSessionItem[];
  team: { id: Id; name: string; studentCount: number | null } | null;
  timeZone: string;
}

/** One day of an event as a student sees it (ST-8 event detail, ST-4 session detail). */
export interface EventDay {
  attendance: MyAttendanceRow | null;
  cancelled: boolean;
  checkInClosesAt: Timestamp | null;
  checkInOpensAt: Timestamp | null;
  coachName: string | null;
  date: DateOnly;
  event: CalendarEvent;
  kind: EventKind;
  /** Later dates of the event or its series (cancelled ones included). */
  nextDates: { cancelled: boolean; date: DateOnly; eventId: Id }[];
  /** Every date of the event or series, for the "Repeats" line. */
  seriesDates: DateOnly[];
  teamName: string | null;
}

/** The student's own row for that day (GET /me/attendance). */
export interface MyAttendanceRow {
  checkInAt: Timestamp | null;
  checkInDistanceM: number | null;
  checkOutAt: Timestamp | null;
  checkOutDistanceM: number | null;
  id: Id;
  notes: string | null;
  recordedBy: { id: Id; name: string } | null;
  recordedById: Id;
  status: AttendanceStatus;
  studentId: Id;
  verifiedAt: Timestamp | null;
  verifiedBy: { id: Id; name: string } | null;
}

/** How far around the event the weekly series is looked for (GET /events allows 92 days). */
const SERIES_BACK_DAYS = 45;
const SERIES_AHEAD_DAYS = 46;
const ISO_DATE_LENGTH = 10;
/** Later dates shown on the student's event page. */
const NEXT_DATES = 3;

/** How far back the Location picker looks for places used before. */
const LOCATION_LOOKBACK_DAYS = 91;

function toCalendarEvent({
  createdById,
  ...event
}: ServerEvent): CalendarEvent {
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
    createdBy: createdById,
    createdAt: event.createdAt,
    updatedAt: event.updatedAt,
  };
}

/** Same series: one-day events with the same title, team, type and times. */
function sameSeries(a: ServerEvent, b: ServerEvent): boolean {
  return (
    a.endDate === null &&
    b.endDate === null &&
    a.title === b.title &&
    a.teamId === b.teamId &&
    a.eventType === b.eventType &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime
  );
}

async function getServerEvent(
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
 * The event's session days, or its weekly series' days, cancelled ones included.
 * One-day events: GET /events?from=&to=&teamId=&includeCancelled=true around the event,
 * keeping the copies of the same series. Several days: GET /events/:id/sessions.
 */
async function findSeries(
  academyId: Id,
  event: ServerEvent
): Promise<{ kind: EventKind; occurrences: ServerOccurrence[] }> {
  if (event.endDate !== null) {
    const sessions = await apiData<ServerSessionFields[]>(
      academyPath(academyId, `/events/${event.id}/sessions`),
      { query: { includeCancelled: true } }
    );
    return {
      kind: "days",
      occurrences: sessions.map((s) => ({ ...event, ...s })),
    };
  }
  const rows = await apiAll<ServerOccurrence>(
    academyPath(academyId, "/events"),
    {
      query: {
        from: addDays(event.startDate, -SERIES_BACK_DAYS),
        to: addDays(event.startDate, SERIES_AHEAD_DAYS),
        teamId: event.teamId ?? undefined,
        eventType: event.eventType,
        includeCancelled: true,
      },
    }
  );
  const occurrences = rows
    .filter((row) => row.id === event.id || sameSeries(row, event))
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const ids = new Set(occurrences.map((o) => o.id));
  return { kind: ids.size > 1 ? "series" : "single", occurrences };
}

/** Coaches, students and every name on the event's team (GET /teams/:id/members). */
async function loadTeam(
  academyId: Id,
  teamId: Id | null
): Promise<{
  team: { id: Id; name: string; studentCount: number | null } | null;
  members: RosterMember[];
}> {
  if (!teamId) {
    return { team: null, members: [] };
  }
  const [teams, members] = await Promise.all([
    apiAll<TeamRow>(academyPath(academyId, "/teams")),
    apiAll<RosterMember>(academyPath(academyId, `/teams/${teamId}/members`)),
  ]);
  const row = teams.find((t) => t.id === teamId);
  const students = members.filter((m) => m.roles.includes("student")).length;
  return {
    team: row
      ? {
          id: row.id,
          name: row.name,
          studentCount: row.studentCount ?? students,
        }
      : null,
    members,
  };
}

/** Rows of the series' past sessions (voided rows left out). Staff only. */
async function loadAttendance(
  academyId: Id,
  event: ServerEvent,
  eventIds: Set<Id>,
  range: { from: DateOnly; to: DateOnly }
): Promise<AttendanceRow[]> {
  if (range.from > range.to) {
    return [];
  }
  const query =
    eventIds.size === 1 || !event.teamId
      ? { eventId: event.id, from: range.from, to: range.to }
      : { teamId: event.teamId, from: range.from, to: range.to };
  const rows = await apiAll<AttendanceRow>(
    academyPath(academyId, "/attendance"),
    { query }
  );
  return rows.filter((r) => !r.voidedAt && eventIds.has(r.eventId));
}

function tallyOf(
  rows: AttendanceRow[],
  studentCount: number | null
): SessionTally {
  const tally: SessionTally = {
    present: 0,
    late: 0,
    absent: 0,
    excused: 0,
    notMarked: null,
  };
  const seen = new Set<Id>();
  for (const row of rows) {
    tally[row.status] += 1;
    seen.add(row.studentId);
  }
  tally.notMarked =
    studentCount === null ? null : Math.max(0, studentCount - seen.size);
  return tally;
}

/** "date" -> who cancelled it and why, from event.session_cancel audit rows (admins). */
async function loadCancelNotes(
  academyId: Id,
  eventIds: Id[]
): Promise<Map<string, { by: string | null; reason: string | null }>> {
  const notes = new Map<string, { by: string | null; reason: string | null }>();
  const pages = await Promise.all(
    eventIds.map((id) =>
      apiAll<AuditRow>(academyPath(academyId, "/audit-log"), {
        query: {
          entityType: "calendar_event",
          entityId: id,
          action: "event.session_cancel",
        },
        maxItems: 200,
      }).then((rows) => ({ id, rows }))
    )
  );
  for (const { id, rows } of pages) {
    for (const row of rows) {
      const before = new Set(
        (row.before?.excludedDates ?? []).map((d) =>
          d.slice(0, ISO_DATE_LENGTH)
        )
      );
      for (const raw of row.after?.excludedDates ?? []) {
        const date = raw.slice(0, ISO_DATE_LENGTH);
        if (!before.has(date)) {
          notes.set(`${id}:${date}`, {
            by: row.actor?.name ?? null,
            reason: row.reason,
          });
        }
      }
    }
  }
  return notes;
}

/**
 * Event detail for academy admins and coaches (CO-2, CO-6): GET /events/:id, its
 * sessions or weekly series (findSeries), the team and its coaches
 * (GET /teams, GET /teams/:id/members), past-session counts (GET /attendance), and for
 * admins who cancelled which day and why (GET /audit-log). Null when not found.
 */
export async function getEventDetail(
  viewer: EventViewer,
  eventId: Id
): Promise<EventDetail | null> {
  if (mock) {
    return (await mock()).getEventDetail(viewer, eventId);
  }
  const { academyId, today } = viewer;
  const event = await getServerEvent(academyId, eventId);
  if (!event) {
    return null;
  }
  const [{ kind, occurrences }, teamInfo] = await Promise.all([
    findSeries(academyId, event),
    loadTeam(academyId, event.teamId),
  ]);
  const eventIds = new Set(occurrences.map((o) => o.id));
  const pastDates = occurrences
    .filter((o) => !o.cancelled && o.sessionDate <= today)
    .map((o) => o.sessionDate);
  const cancelledIds = [
    ...new Set(occurrences.filter((o) => o.cancelled).map((o) => o.id)),
  ];
  const [rows, notes] = await Promise.all([
    viewer.isStaff && event.collectAttendance && pastDates.length > 0
      ? loadAttendance(academyId, event, eventIds, {
          from: pastDates[0] ?? today,
          to: pastDates.at(-1) ?? today,
        })
      : Promise.resolve([] as AttendanceRow[]),
    viewer.isAdmin && cancelledIds.length > 0
      ? loadCancelNotes(academyId, cancelledIds).catch(
          () => new Map<string, { by: string | null; reason: string | null }>()
        )
      : Promise.resolve(
          new Map<string, { by: string | null; reason: string | null }>()
        ),
  ]);
  const studentCount = teamInfo.team?.studentCount ?? null;
  const sessions: EventSessionItem[] = occurrences.map((o) => {
    const note = notes.get(`${o.id}:${o.sessionDate}`);
    const counted =
      viewer.isStaff &&
      o.collectAttendance &&
      !o.cancelled &&
      o.sessionDate <= today;
    return {
      eventId: o.id,
      date: o.sessionDate,
      cancelled: o.cancelled,
      cancelledBy: note?.by ?? null,
      cancelReason: note?.reason ?? null,
      startTime: o.startTime,
      endTime: o.endTime,
      location: o.location,
      checkInOpensAt: o.checkInOpensAt,
      checkInClosesAt: o.checkInClosesAt,
      tally: counted
        ? tallyOf(
            rows.filter(
              (r) => r.eventId === o.id && r.sessionDate === o.sessionDate
            ),
            studentCount
          )
        : null,
    };
  });
  const creator = teamInfo.members.find((m) => m.userId === event.createdById);
  let creatorName: string | null = creator?.name ?? null;
  if (!creatorName && event.createdById === viewer.userId) {
    creatorName = "you";
  }
  return {
    event: toCalendarEvent(event),
    kind,
    seriesEventIds: [...eventIds],
    sessions,
    team: teamInfo.team,
    coaches: teamInfo.members
      .filter((m) => m.roles.includes("coach"))
      .map((m) => m.name),
    creatorName,
    timeZone: viewer.timeZone,
  };
}

/** Pick the coach students see on a team: a coach-only member first, then any coach. */
function teamCoachName(members: RosterMember[]): string | null {
  const coaches = members.filter((m) => m.roles.includes("coach"));
  const coach = coaches.find((m) => !m.roles.includes("admin")) ?? coaches[0];
  return coach?.name ?? null;
}

/**
 * One day of an event for the signed-in student (ST-8, ST-4): GET /events/:id, the
 * series (findSeries), the team and its coach (GET /teams, GET /teams/:id/members) and
 * the student's own row that day (GET /me/attendance?academyId=&from=&to=).
 * `date` defaults to the first date on or after today. Null when not found.
 */
export async function getEventDay(
  viewer: Pick<EventViewer, "academyId" | "today">,
  eventId: Id,
  date: DateOnly | undefined
): Promise<EventDay | null> {
  if (mock) {
    return (await mock()).getEventDay(viewer, eventId, date);
  }
  const { academyId, today } = viewer;
  const event = await getServerEvent(academyId, eventId);
  if (!event) {
    return null;
  }
  const [{ kind, occurrences }, teamInfo] = await Promise.all([
    findSeries(academyId, event),
    loadTeam(academyId, event.teamId),
  ]);
  const own = occurrences.filter((o) => o.id === event.id);
  const day =
    (date ? own.find((o) => o.sessionDate === date) : undefined) ??
    (date
      ? undefined
      : (own.find((o) => o.sessionDate >= today) ?? own.at(-1)));
  if (!day) {
    return null;
  }
  const rows = await apiAll<MyAttendanceRow & { eventId: Id }>(
    "/me/attendance",
    { query: { academyId, from: day.sessionDate, to: day.sessionDate } }
  );
  return {
    event: toCalendarEvent(event),
    kind,
    date: day.sessionDate,
    cancelled: day.cancelled,
    checkInOpensAt: day.checkInOpensAt,
    checkInClosesAt: day.checkInClosesAt,
    teamName: teamInfo.team?.name ?? null,
    coachName: teamCoachName(teamInfo.members),
    attendance: rows.find((r) => r.eventId === event.id) ?? null,
    seriesDates: occurrences.map((o) => o.sessionDate),
    nextDates: occurrences
      .filter((o) => o.sessionDate > day.sessionDate)
      .slice(0, NEXT_DATES)
      .map((o) => ({
        eventId: o.id,
        date: o.sessionDate,
        cancelled: o.cancelled,
      })),
  };
}

/**
 * One event per date (a single event when `dates` has one entry).
 * POST /events for each date (coach: own teams, teamId required). A multi-day event
 * keeps its length on every copy. The creator is the session user.
 */
export async function createEvents(
  academyId: Id,
  input: { event: CreateEventInput; dates: DateOnly[] }
): Promise<CalendarEvent[]> {
  if (mock) {
    return (await mock()).createEvents(academyId, input);
  }
  const { event } = input;
  const length = event.endDate
    ? daysBetween(event.startDate, event.endDate)
    : 0;
  const created = await Promise.all(
    input.dates.map((startDate) =>
      apiData<ServerEvent>(academyPath(academyId, "/events"), {
        method: "POST",
        body: {
          title: event.title,
          eventType: event.eventType,
          teamId: event.teamId,
          startDate,
          endDate: length > 0 ? addDays(startDate, length) : null,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location || null,
          description: event.description || null,
          collectAttendance: event.collectAttendance,
        },
      })
    )
  );
  return created.map(toCalendarEvent);
}

/**
 * Edit an event, or every event of a series still to come (PATCH /events/:id each).
 * The server refuses date, time and team changes once an event has attendance
 * (409 `attendance_exists`); the first failure is thrown after the others are tried.
 */
export async function updateEvents(
  academyId: Id,
  input: { eventIds: Id[]; changes: EventChanges }
): Promise<{ updated: number }> {
  if (mock) {
    return (await mock()).updateEvents(academyId, input);
  }
  const outcomes = await Promise.allSettled(
    input.eventIds.map((id) =>
      apiData<ServerEvent>(academyPath(academyId, `/events/${id}`), {
        method: "PATCH",
        body: input.changes,
      })
    )
  );
  const failed = outcomes.find((o) => o.status === "rejected");
  if (failed) {
    throw failed.reason;
  }
  return { updated: outcomes.length };
}

/**
 * Cancel one day (CO-6): POST /events/:id/sessions/:date/cancel { reason }. Refused once
 * anyone has checked in (409 `attendance_exists`); the reason goes to the activity log.
 */
export async function cancelEventDay(
  academyId: Id,
  input: { eventId: Id; date: DateOnly; reason: string }
): Promise<{ eventId: Id; date: DateOnly }> {
  if (mock) {
    return (await mock()).cancelEventDay(academyId, input);
  }
  await apiData(
    academyPath(
      academyId,
      `/events/${input.eventId}/sessions/${input.date}/cancel`
    ),
    { method: "POST", body: input.reason ? { reason: input.reason } : {} }
  );
  return input;
}

/**
 * "Delete event": removes every date still to come; past sessions and their attendance
 * stay. Each event whose dates are all still to come is deleted (DELETE /events/:id);
 * an event that already has a past or attended date has its remaining days cancelled
 * instead (POST .../sessions/:date/cancel), as the server asks.
 */
export async function deleteUpcoming(
  academyId: Id,
  input: {
    sessions: Pick<
      EventSessionItem,
      "eventId" | "date" | "cancelled" | "tally"
    >[];
    today: DateOnly;
  }
): Promise<{ deleted: number; cancelled: number; kept: number }> {
  if (mock) {
    return (await mock()).deleteUpcoming(academyId, input);
  }
  const byEvent = new Map<Id, typeof input.sessions>();
  for (const s of input.sessions) {
    byEvent.set(s.eventId, [...(byEvent.get(s.eventId) ?? []), s]);
  }
  let deleted = 0;
  let cancelled = 0;
  let kept = 0;
  const deleteOrCancel = async (
    eventId: Id,
    days: typeof input.sessions
  ): Promise<void> => {
    // Days someone has checked in to stay (the server refuses to remove them); the
    // tallies the page already loaded say which, so no request is sent to be refused.
    const attended = days.filter((d) => hasCheckIns(d.tally));
    kept += attended.filter((d) => d.date >= input.today).length;
    if (deletesWholeEvent(days, input.today)) {
      try {
        await apiRaw(academyPath(academyId, `/events/${eventId}`), {
          method: "DELETE",
        });
        deleted += 1;
        return;
      } catch (error) {
        if (!isApiError(error, "attendance_exists")) {
          throw error;
        }
      }
    }
    const open = days.filter(
      (d) => !(d.cancelled || hasCheckIns(d.tally)) && d.date >= input.today
    );
    const results = await Promise.allSettled(
      open.map((d) =>
        cancelEventDay(academyId, { eventId, date: d.date, reason: "" })
      )
    );
    cancelled += results.filter((r) => r.status === "fulfilled").length;
    kept += results.filter((r) => r.status === "rejected").length;
  };
  await Promise.all(
    [...byEvent.entries()].map(([eventId, days]) =>
      deleteOrCancel(eventId, days)
    )
  );
  return { deleted, cancelled, kept };
}

/**
 * Places used before, for the Location picker: distinct `location` of the events the
 * caller can see over the last three months (GET /events?from=&to=).
 */
export async function listEventLocations(
  academyId: Id,
  params: { today: DateOnly }
): Promise<string[]> {
  if (mock) {
    return (await mock()).listEventLocations(academyId);
  }
  const events = await apiAll<{ location: string | null }>(
    academyPath(academyId, "/events"),
    {
      query: {
        from: addDays(params.today, 1 - LOCATION_LOOKBACK_DAYS),
        to: params.today,
      },
    }
  );
  const seen = new Set<string>();
  for (const e of events) {
    if (e.location) {
      seen.add(e.location);
    }
  }
  return [...seen].sort();
}
