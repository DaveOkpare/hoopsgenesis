/*
 * Calendar data for admins and coaches (CO-2, CO-6, ST-8). Convention: see
 * features/viewer/api.ts; the fixture twin is ./api.mock.ts (dev preview only).
 *
 * GET /events?from&to&includeCancelled=true answers one row per session day (an event
 * spanning several days gives one row per day), already scoped by the server: admins
 * see the whole academy, coaches academy-wide events plus their teams'. Teams come from
 * GET /teams (same scoping) and each roster (GET /teams/:teamId/members) for the coach
 * name.
 */
import { type TeamTone, toneForTeamId } from "@/features/calendar/tone";
import type { AcademyRole, DateOnly, Id, Timestamp } from "@/features/types";
import { academyPath, apiAll } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface CalendarRange {
  from: DateOnly;
  to: DateOnly;
}

export interface CalendarTeam {
  /** A coach-only member first, then any coach; null when the team has none. */
  coachName: string | null;
  id: Id;
  name: string;
  studentCount: number;
  tone: TeamTone;
}

/** One day of an event: a session, a match day, a camp day or a cancelled day. */
export interface CalendarItem {
  cancelled: boolean;
  checkInOpensAt: Timestamp | null;
  collectAttendance: boolean;
  dayCount: number;
  /** 1-based day of a multi-day event ("Camp, day 2"); 1 for one-day events. */
  dayIndex: number;
  endsAt: Timestamp | null;
  endTime: string | null;
  eventId: Id;
  eventType: string;
  /** `${eventId}:${sessionDate}` */
  key: string;
  location: string | null;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: string | null;
  teamId: Id | null;
  title: string;
}

/** GET /events row: the event plus one session's fields. */
interface EventRow {
  cancelled: boolean;
  checkInOpensAt: Timestamp | null;
  collectAttendance: boolean;
  endDate: DateOnly | null;
  endsAt: Timestamp | null;
  endTime: string | null;
  eventType: string;
  id: Id;
  location: string | null;
  sessionDate: DateOnly;
  startDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: string | null;
  teamId: Id | null;
  title: string;
}

interface TeamRow {
  id: Id;
  name: string;
  studentCount?: number;
}

interface RosterRow {
  name: string;
  roles: AcademyRole[];
  userId: Id;
}

const MS_PER_DAY = 86_400_000;

function dayNumber(from: DateOnly, to: DateOnly): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
      MS_PER_DAY
  );
}

export function toCalendarItem(row: EventRow): CalendarItem {
  const lastDate = row.endDate ?? row.startDate;
  return {
    key: `${row.id}:${row.sessionDate}`,
    eventId: row.id,
    title: row.title,
    eventType: row.eventType,
    teamId: row.teamId,
    sessionDate: row.sessionDate,
    startTime: row.startTime,
    endTime: row.endTime,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    checkInOpensAt: row.checkInOpensAt,
    location: row.location,
    cancelled: row.cancelled,
    collectAttendance: row.collectAttendance,
    dayIndex: dayNumber(row.startDate, row.sessionDate) + 1,
    dayCount: dayNumber(row.startDate, lastDate) + 1,
  };
}

/** GET /events?from&to&includeCancelled=true, every page, in date and time order. */
export async function listCalendarItems(
  academyId: Id,
  range: CalendarRange
): Promise<CalendarItem[]> {
  if (mock) {
    return (await mock()).listCalendarItems(academyId, range);
  }
  const rows = await apiAll<EventRow>(academyPath(academyId, "/events"), {
    query: { from: range.from, to: range.to, includeCancelled: true },
  });
  return rows.map(toCalendarItem);
}

function coachOf(roster: RosterRow[]): string | null {
  const coaches = roster.filter((row) => row.roles.includes("coach"));
  const coach =
    coaches.find((row) => !row.roles.includes("admin")) ?? coaches[0];
  return coach?.name ?? null;
}

/** GET /teams and each roster (GET /teams/:teamId/members) for the coach's name. */
export async function listCalendarTeams(
  academyId: Id
): Promise<CalendarTeam[]> {
  if (mock) {
    return (await mock()).listCalendarTeams(academyId);
  }
  const teams = await apiAll<TeamRow>(academyPath(academyId, "/teams"));
  const rosters = await Promise.all(
    teams.map((team) =>
      apiAll<RosterRow>(academyPath(academyId, `/teams/${team.id}/members`))
    )
  );
  return teams.map((team, index) => {
    const roster = rosters[index] ?? [];
    return {
      id: team.id,
      name: team.name,
      tone: toneForTeamId(team.id),
      coachName: coachOf(roster),
      studentCount:
        team.studentCount ??
        roster.filter((row) => row.roles.includes("student")).length,
    };
  });
}
