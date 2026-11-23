/*
 * Student calendar data (ST-8). Data-layer convention: see features/viewer/api.ts.
 */
import type {
  AcademyRole,
  CalendarEvent,
  DateOnly,
  Id,
  Paginated,
  Timestamp,
  UserSummary,
} from "@/features/types";
import { academyPath, apiAll } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/**
 * An event as the student calendar shows it, once per event (the client expands
 * multi-day events into days). `teamName` and `coach` come from the student's team and
 * its roster; `cancelReason` is the note a coach gives when cancelling a session
 * (CO-6), which the server does not store, so it is always null in real mode.
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

/** One session day of an event, as GET /events returns it. */
export interface EventOccurrence {
  cancelled: boolean;
  checkInClosesAt: Timestamp | null;
  checkInOpensAt: Timestamp | null;
  endsAt: Timestamp | null;
  event: StudentEvent;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
}

/** GET /events row: the event plus one session's fields. */
interface EventRow {
  academyId: Id;
  cancelled: boolean;
  checkInClosesAt: Timestamp | null;
  checkInOpensAt: Timestamp | null;
  collectAttendance: boolean;
  createdAt: Timestamp;
  createdById: Id;
  description: string | null;
  endDate: DateOnly | null;
  endsAt: Timestamp | null;
  endTime: string | null;
  eventType: string;
  excludedDates: DateOnly[];
  id: Id;
  location: string | null;
  sessionDate: DateOnly;
  startDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: string | null;
  teamId: Id | null;
  title: string;
  updatedAt: Timestamp;
}

interface TeamRow {
  id: Id;
  name: string;
}

interface RosterRow {
  image: string | null;
  name: string;
  roles: AcademyRole[];
  userId: Id;
}

/** A person on the student's team(s), with their roles (for "Coach Patrick"). */
export interface TeamPerson {
  id: Id;
  name: string;
  roles: AcademyRole[];
}

/** The student's teams, each with its coach, and everyone on them by id. */
export interface MyTeams {
  people: Map<Id, TeamPerson>;
  teams: Map<Id, { coach: UserSummary | null; name: string }>;
}

const TEAM_CACHE_MS = 60_000;
const teamCache = new Map<Id, { at: number; value: Promise<MyTeams> }>();

/** The coach shown on a team's events: a coach-only member first, then any coach. */
function teamCoach(roster: RosterRow[]): UserSummary | null {
  const coaches = roster.filter((row) => row.roles.includes("coach"));
  const coach =
    coaches.find((row) => !row.roles.includes("admin")) ?? coaches[0];
  return coach
    ? { id: coach.userId, name: coach.name, email: "", image: coach.image }
    : null;
}

async function fetchMyTeams(academyId: Id): Promise<MyTeams> {
  const teams = await apiAll<TeamRow>(academyPath(academyId, "/teams"));
  const rosters = await Promise.all(
    teams.map((team) =>
      apiAll<RosterRow>(academyPath(academyId, `/teams/${team.id}/members`))
    )
  );
  const people = new Map<Id, TeamPerson>();
  const byTeam = new Map<Id, { coach: UserSummary | null; name: string }>();
  teams.forEach((team, index) => {
    const roster = rosters[index] ?? [];
    byTeam.set(team.id, { name: team.name, coach: teamCoach(roster) });
    for (const row of roster) {
      people.set(row.userId, {
        id: row.userId,
        name: row.name,
        roles: row.roles,
      });
    }
  });
  return { teams: byTeam, people };
}

/**
 * GET /teams (a student sees only their own team) and GET /teams/:teamId/members, kept
 * for a minute: the calendar, Today and records all read it.
 */
export function loadMyTeams(academyId: Id): Promise<MyTeams> {
  const cached = teamCache.get(academyId);
  if (cached && Date.now() - cached.at < TEAM_CACHE_MS) {
    return cached.value;
  }
  const value = fetchMyTeams(academyId);
  value.catch(() => teamCache.delete(academyId));
  teamCache.set(academyId, { at: Date.now(), value });
  return value;
}

function toStudentEvent(row: EventRow, teams: MyTeams): StudentEvent {
  const team = row.teamId ? teams.teams.get(row.teamId) : undefined;
  return {
    id: row.id,
    academyId: row.academyId,
    teamId: row.teamId,
    eventType: row.eventType,
    title: row.title,
    description: row.description,
    location: row.location,
    startDate: row.startDate,
    endDate: row.endDate,
    startTime: row.startTime,
    endTime: row.endTime,
    excludedDates: row.excludedDates,
    collectAttendance: row.collectAttendance,
    createdBy: row.createdById,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    teamName: team?.name ?? null,
    coach: team?.coach ?? null,
    cancelReason: null,
  };
}

/**
 * GET /api/v1/academies/:academyId/events?from=&to=&includeCancelled=true
 * Every session day in the range (academy-wide events plus the caller's team's), with
 * cancelled days, in date and time order.
 */
export async function listEventOccurrences(
  academyId: Id,
  range: EventRange
): Promise<EventOccurrence[]> {
  if (mock) {
    return (await mock()).listEventOccurrences(academyId, range);
  }
  const [rows, teams] = await Promise.all([
    apiAll<EventRow>(academyPath(academyId, "/events"), {
      query: { from: range.from, to: range.to, includeCancelled: true },
    }),
    loadMyTeams(academyId),
  ]);
  return rows.map((row) => ({
    event: toStudentEvent(row, teams),
    sessionDate: row.sessionDate,
    cancelled: row.cancelled,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    checkInOpensAt: row.checkInOpensAt,
    checkInClosesAt: row.checkInClosesAt,
  }));
}

/**
 * Academy-wide events plus the caller's team's events overlapping the range, each event
 * once, in order of their first day in the range (from GET /events, which answers one
 * row per session day). Cancelled days are in `excludedDates`.
 */
export async function listEvents(
  academyId: Id,
  range: EventRange
): Promise<Paginated<StudentEvent>> {
  if (mock) {
    return (await mock()).listEvents(academyId, range);
  }
  const occurrences = await listEventOccurrences(academyId, range);
  const seen = new Map<Id, StudentEvent>();
  for (const occurrence of occurrences) {
    if (!seen.has(occurrence.event.id)) {
      seen.set(occurrence.event.id, occurrence.event);
    }
  }
  return { data: [...seen.values()], nextCursor: null };
}
