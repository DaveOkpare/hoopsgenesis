/*
 * Teams list and create-team for the academy admin (story AO-3, Paper 72W-0, 75J-0, 7DB-0).
 * Real implementation: GET /teams (+ rosters and attendance summaries) and Better Auth's
 * organization plugin for writes. Preview mode delegates to ./api.mock.ts.
 */
import {
  type ApiTeam,
  fetchAcademyTimeZone,
  fetchMembersWithTeams,
  fetchOpenInvitations,
  fetchTeamRoster,
  fetchTeams,
  fetchTeamsWithRosters,
} from "@/features/members/directory";
import type {
  DateOnly,
  Id,
  Invitation,
  Team,
  Timestamp,
  UserSummary,
} from "@/features/types";
import { academyPath, apiAll, apiData, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/**
 * Whether a team's sport is stored. The schema has no sport column, so in real mode the
 * Create team form hides the Sport field and cards show no sport. Preview keeps the
 * designs' sport.
 */
export const TEAM_SPORT_STORED = mock !== null;

/** A coach invited to the team who has not joined ("Sarah K.'s invite expired"). */
export interface TeamCoachInvite {
  email: string;
  status: "pending" | "expired";
}

/** One card of the Teams list: the team plus its roster summary. */
export interface TeamListItem {
  /** Attendance this month; null until the team has had a session. */
  attendancePercent: number | null;
  coaches: UserSummary[];
  /** Shown only when the team has no coach yet. */
  coachInvite: TeamCoachInvite | null;
  /** "Basketball", "Football"; null when not set (not in the schema). */
  sport: string | null;
  studentCount: number;
  team: Team;
}

/** An academy member who can be put on a team (identified by user id). */
export interface CoachCandidate {
  /** When they joined the academy (member.createdAt). */
  joinedAt?: Timestamp;
  user: UserSummary;
}

/** GET /teams/:teamId/attendance-summary (team totals and one row per student). */
interface AttendanceSummary {
  team: { rate: number | null };
}

const PERCENT = 100;

/** Plain date in the academy's time zone ("YYYY-MM-DD"). */
export function plainDateIn(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/**
 * Team attendance this month from GET /teams/:teamId/attendance-summary: the server's
 * team rate, (present + late) / (present + late + absent). null when nothing counts yet.
 */
export async function fetchTeamAttendancePercent(
  academyId: Id,
  teamId: Id,
  range: { from: string; to: string }
): Promise<number | null> {
  const summary = await apiData<AttendanceSummary>(
    academyPath(
      academyId,
      `/teams/${encodeURIComponent(teamId)}/attendance-summary`
    ),
    { query: range }
  );
  const { rate } = summary.team;
  return rate === null ? null : Math.round(rate * PERCENT);
}

/** First of this month to today, in the academy's time zone. */
export function monthToDate(timeZone: string): { from: string; to: string } {
  const to = plainDateIn(appNow(), timeZone);
  return { from: `${to.slice(0, "YYYY-MM".length)}-01`, to };
}

function coachInviteFor(
  teamId: Id,
  invitations: Invitation[]
): TeamCoachInvite | null {
  const invite = invitations.find(
    (i) => i.teamId === teamId && i.role === "coach"
  );
  if (!invite) {
    return null;
  }
  return {
    email: invite.email,
    status: invite.status === "pending" ? "pending" : "expired",
  };
}

function toTeam(team: ApiTeam): Team {
  return {
    id: team.id,
    academyId: team.academyId,
    name: team.name,
    ageGroup: team.ageGroup,
    createdAt: team.createdAt,
  };
}

/**
 * Teams in an academy with coaches, student counts and attendance this month.
 * `GET /teams` + `GET /teams/:teamId/members` + `GET /teams/:teamId/attendance-summary`
 * + `organization.listInvitations` for coach invites.
 */
export async function listTeams(academyId: Id): Promise<TeamListItem[]> {
  if (mock) {
    return (await mock()).listTeams(academyId);
  }
  const [{ teams, rosters }, invitations, timeZone] = await Promise.all([
    fetchTeamsWithRosters(academyId),
    fetchOpenInvitations(academyId),
    fetchAcademyTimeZone(academyId),
  ]);
  const range = monthToDate(timeZone);
  const percents = await Promise.all(
    teams.map((team) => fetchTeamAttendancePercent(academyId, team.id, range))
  );
  return teams.map((team, index) => {
    const coaches = (rosters.get(team.id) ?? [])
      .filter((row) => row.roles.includes("coach"))
      .map((row) => ({
        id: row.userId,
        name: row.name,
        image: row.image,
        email: "",
      }));
    return {
      team: toTeam(team),
      sport: null,
      coaches,
      studentCount: team.studentCount,
      attendancePercent: percents[index] ?? null,
      coachInvite:
        coaches.length === 0 ? coachInviteFor(team.id, invitations) : null,
    };
  });
}

/**
 * Students in the academy who are not on any team ("1 student joined without a team").
 * Better Auth members + GET /teams rosters, filtered here.
 */
export async function listStudentsWithoutTeam(
  academyId: Id
): Promise<CoachCandidate[]> {
  if (mock) {
    return (await mock()).listStudentsWithoutTeam(academyId);
  }
  const { members } = await fetchMembersWithTeams(academyId);
  return members
    .filter((m) => m.roles.includes("student") && m.teamIds.length === 0)
    .map((m) => ({ user: m.user, joinedAt: m.createdAt }));
}

/** Coaches in the academy, for the Create team coach picker (Better Auth members). */
export async function listCoachCandidates(
  academyId: Id
): Promise<CoachCandidate[]> {
  if (mock) {
    return (await mock()).listCoachCandidates(academyId);
  }
  const { members } = await fetchMembersWithTeams(academyId);
  return members
    .filter((m) => m.roles.includes("coach"))
    .map((m) => ({ user: m.user }))
    .sort((a, b) => a.user.name.localeCompare(b.user.name));
}

// ---------------------------------------------------------------- My teams (coach)

/** The next session of a team, from GET /events (one occurrence). */
export interface TeamNextSession {
  /** When check-in opens; null when the event takes no attendance. */
  checkInOpensAt: Timestamp | null;
  eventId: Id;
  location: string | null;
  sessionDate: DateOnly;
  /** "16:00"; null for an all-day event. */
  startTime: string | null;
  title: string;
}

/** One card of the coach's "My teams" (CO-10, Paper 8RA-0 / C6C-0). */
export interface MyTeam {
  /** Team attendance this month; null until a session counts. */
  attendancePercent: number | null;
  coaches: UserSummary[];
  /** Next session today or later (next four weeks); null when none is planned. */
  nextSession: TeamNextSession | null;
  /** Not stored by the server: null in real mode. */
  sport: string | null;
  studentCount: number;
  team: Team;
  /** Students with a fee due and unpaid today (GET /fees/outstanding). */
  unpaidCount: number;
}

/** GET /events item (the fields My teams reads). */
interface EventOccurrence {
  cancelled: boolean;
  checkInOpensAt: Timestamp | null;
  collectAttendance: boolean;
  endsAt: Timestamp | null;
  id: Id;
  location: string | null;
  sessionDate: DateOnly;
  startsAt: Timestamp | null;
  startTime: string | null;
  teamId: Id | null;
  title: string;
}

const NEXT_SESSION_LOOKAHEAD_DAYS = 28;
const MS_PER_DAY = 86_400_000;

function addDaysTo(date: DateOnly, days: number): DateOnly {
  return new Date(Date.parse(`${date}T12:00:00Z`) + days * MS_PER_DAY)
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
}

/** First occurrence not cancelled and not over yet, in time order. */
export function pickNextSession(
  occurrences: EventOccurrence[],
  now: Date
): TeamNextSession | null {
  const nowMs = now.getTime();
  const [next] = occurrences
    .filter((o) => !o.cancelled)
    .filter((o) => {
      const end = o.endsAt ?? o.startsAt;
      return end === null || Date.parse(end) > nowMs;
    })
    .sort((a, b) =>
      `${a.sessionDate} ${a.startTime ?? ""}`.localeCompare(
        `${b.sessionDate} ${b.startTime ?? ""}`
      )
    );
  if (!next) {
    return null;
  }
  return {
    eventId: next.id,
    sessionDate: next.sessionDate,
    startTime: next.startTime,
    title: next.title,
    location: next.location,
    checkInOpensAt: next.collectAttendance ? next.checkInOpensAt : null,
  };
}

/**
 * The coach's teams with this month's attendance, unpaid count and next session.
 * GET /teams (the caller's teams, with student counts), and per team
 * GET /teams/:teamId/members (coaches), GET /teams/:teamId/attendance-summary,
 * GET /fees/outstanding?teamId=&on=today and GET /events?teamId=&from=today&to=+4 weeks.
 */
export async function listMyTeams(
  academyId: Id,
  params: { today: DateOnly }
): Promise<MyTeam[]> {
  if (mock) {
    return (await mock()).listMyTeams(academyId, params);
  }
  const { today } = params;
  const teams = await fetchTeams(academyId);
  const range = { from: `${today.slice(0, "YYYY-MM".length)}-01`, to: today };
  const now = appNow();
  const cards = await Promise.all(
    teams.map(async (team) => {
      const [roster, percent, outstanding, occurrences] = await Promise.all([
        fetchTeamRoster(academyId, team.id),
        fetchTeamAttendancePercent(academyId, team.id, range),
        apiAll<{ student: { id: Id } }>(
          academyPath(academyId, "/fees/outstanding"),
          { query: { teamId: team.id, on: today } }
        ),
        apiAll<EventOccurrence>(academyPath(academyId, "/events"), {
          query: {
            teamId: team.id,
            from: today,
            to: addDaysTo(today, NEXT_SESSION_LOOKAHEAD_DAYS),
          },
        }),
      ]);
      return {
        team: toTeam(team),
        sport: null,
        studentCount: team.studentCount,
        attendancePercent: percent,
        unpaidCount: new Set(outstanding.map((row) => row.student.id)).size,
        coaches: roster
          .filter((row) => row.roles.includes("coach"))
          .map((row) => ({
            id: row.userId,
            name: row.name,
            image: row.image,
            email: "",
          })),
        nextSession: pickNextSession(
          occurrences.filter((o) => o.teamId === team.id),
          now
        ),
      };
    })
  );
  return cards.sort((a, b) => a.team.name.localeCompare(b.team.name));
}

export interface CreateTeamInput {
  academyId: Id;
  ageGroup: string | null;
  /** Coaches to put on the team (user ids). */
  coachUserIds?: Id[];
  name: string;
  /** null for "Other". Not stored in real mode (no column). */
  sport?: string | null;
}

/**
 * `organization.createTeam({ name, organizationId, ageGroup })`, then
 * `organization.addTeamMember({ teamId, userId })` for each coach. Better Auth does not
 * refuse a duplicate name, so it is checked here against GET /teams first.
 */
export async function createTeam(input: CreateTeamInput): Promise<Team> {
  if (mock) {
    return (await mock()).createTeam(input);
  }
  const name = input.name.trim();
  const { teams } = await fetchTeamsWithRosters(input.academyId);
  if (teams.some((team) => team.name.toLowerCase() === name.toLowerCase())) {
    throw new Error(`You already have a team called ${name}.`);
  }
  const created = unwrapAuth(
    await authClient.organization.createTeam({
      name,
      organizationId: input.academyId,
      ...(input.ageGroup?.trim() ? { ageGroup: input.ageGroup.trim() } : {}),
    })
  );
  await Promise.all(
    (input.coachUserIds ?? []).map(async (userId) =>
      unwrapAuth(
        await authClient.organization.addTeamMember({
          teamId: created.id,
          userId,
          organizationId: input.academyId,
        })
      )
    )
  );
  return {
    id: created.id,
    academyId: input.academyId,
    name: created.name,
    ageGroup: (created as { ageGroup?: string | null }).ageGroup ?? null,
    createdAt:
      created.createdAt instanceof Date
        ? created.createdAt.toISOString()
        : String(created.createdAt),
  };
}
