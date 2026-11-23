/*
 * Preview-mode (fixture) implementation of features/teams/api.ts. Dev only.
 * Rosters, coaches and sports are read from the team page's fixtures
 * (features/team-detail) so the list, the team page and their mutations agree.
 */
import { fixtureDelay, teams as teamFixtures } from "@/features/fixtures";
import { listInvitations } from "@/features/members/api.mock";
import { calendarEvents } from "@/features/sessions/fixtures";
import {
  addMinutes,
  WINDOW_OPENS_BEFORE_MIN,
  zonedInstant,
} from "@/features/sessions/time";
import { addTeamMember } from "@/features/team-detail/api.mock";
import { academyMembers, teamSport } from "@/features/team-detail/fixtures";
import {
  type CoachCandidate,
  type CreateTeamInput,
  type MyTeam,
  pickNextSession,
  type TeamCoachInvite,
  type TeamListItem,
  type TeamNextSession,
} from "@/features/teams/api";
import {
  PREVIEW_COACH_ID,
  teamAttendancePercent,
  teamUnpaidCount,
} from "@/features/teams/fixtures";
import { createdTeamSports, createdTeams } from "@/features/teams/store";
import type {
  DateOnly,
  Id,
  Invitation,
  Team,
  UserSummary,
} from "@/features/types";
import { appNow } from "@/lib/preview";

function academyTeams(academyId: Id): Team[] {
  return [...teamFixtures, ...createdTeams].filter(
    (team) => team.academyId === academyId
  );
}

function sportOf(teamId: Id): string | null {
  return teamSport[teamId] ?? createdTeamSports[teamId] ?? null;
}

function byName(a: UserSummary, b: UserSummary): number {
  return a.name.localeCompare(b.name);
}

function coachInviteFor(
  team: Team,
  invitations: Invitation[]
): TeamCoachInvite | null {
  const invite = invitations.find(
    (i) =>
      i.teamId === team.id &&
      i.role === "coach" &&
      (i.status === "pending" || i.status === "expired")
  );
  if (!invite) {
    return null;
  }
  return {
    email: invite.email,
    status: invite.status === "pending" ? "pending" : "expired",
  };
}

function listItemFor(team: Team, invitations: Invitation[]): TeamListItem {
  const onTeam = academyMembers.filter(
    (m) => m.academyId === team.academyId && m.teamIds.includes(team.id)
  );
  const coaches = onTeam
    .filter((m) => m.roles.includes("coach"))
    .map((m) => m.user)
    .sort(byName);
  return {
    team,
    sport: sportOf(team.id),
    coaches,
    studentCount: onTeam.filter((m) => m.roles.includes("student")).length,
    attendancePercent: teamAttendancePercent[team.id] ?? null,
    coachInvite:
      coaches.length === 0 ? coachInviteFor(team, invitations) : null,
  };
}

/**
 * Teams in an academy with coaches, student counts and attendance this month.
 * Real: `GET /teams` (admin: all teams, with member counts)
 * + `GET /teams/:teamId/attendance-summary` + `organization.listInvitations` for coach invites.
 */
export async function listTeams(academyId: Id): Promise<TeamListItem[]> {
  const invitations = await listInvitations(academyId);
  return academyTeams(academyId).map((team) => listItemFor(team, invitations));
}

/**
 * Students in the academy who are not on any team ("1 student joined without a team").
 * Real: `organization.getFullOrganization` (members + teams), filtered on the client.
 */
export async function listStudentsWithoutTeam(
  academyId: Id
): Promise<CoachCandidate[]> {
  await fixtureDelay();
  return academyMembers
    .filter(
      (m) =>
        m.academyId === academyId &&
        m.roles.includes("student") &&
        m.teamIds.length === 0
    )
    .map((m) => ({ user: m.user }));
}

/**
 * Coaches in the academy, for the Create team coach picker.
 * Real: `organization.getFullOrganization` members with the coach role.
 */
export async function listCoachCandidates(
  academyId: Id
): Promise<CoachCandidate[]> {
  await fixtureDelay();
  return academyMembers
    .filter((m) => m.academyId === academyId && m.roles.includes("coach"))
    .map((m) => ({ user: m.user }))
    .sort((a, b) => byName(a.user, b.user));
}

const KIGALI = "Africa/Kigali";

/** The team's next session from the fixture calendar (single-date events). */
function nextSessionOf(teamId: Id, now: Date): TeamNextSession | null {
  const occurrences = calendarEvents
    .filter((e) => e.teamId === teamId && e.startTime)
    .map((e) => {
      const startsAt = zonedInstant(
        e.startDate,
        e.startTime ?? "00:00",
        KIGALI
      );
      const endsAt = zonedInstant(
        e.startDate,
        e.endTime ?? e.startTime ?? "00:00",
        KIGALI
      );
      return {
        id: e.id,
        cancelled: e.excludedDates.includes(e.startDate),
        collectAttendance: e.collectAttendance,
        checkInOpensAt: addMinutes(
          startsAt,
          -WINDOW_OPENS_BEFORE_MIN
        ).toISOString(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        sessionDate: e.startDate,
        startTime: e.startTime,
        location: e.location,
        teamId: e.teamId,
        title: e.title,
      };
    });
  return pickNextSession(occurrences, now);
}

/**
 * The preview coach's teams (GET /teams returns only the caller's teams), with the
 * numbers drawn on My teams (8RA-0, C6C-0).
 */
export async function listMyTeams(
  academyId: Id,
  _params: { today: DateOnly }
): Promise<MyTeam[]> {
  await fixtureDelay();
  const coach = academyMembers.find(
    (m) => m.academyId === academyId && m.userId === PREVIEW_COACH_ID
  );
  const now = appNow();
  return academyTeams(academyId)
    .filter((team) => coach?.teamIds.includes(team.id))
    .map((team) => {
      const item = listItemFor(team, []);
      return {
        team,
        sport: item.sport,
        studentCount: item.studentCount,
        attendancePercent: item.attendancePercent,
        unpaidCount: teamUnpaidCount[team.id] ?? 0,
        coaches: item.coaches,
        nextSession: nextSessionOf(team.id, now),
      };
    })
    .sort((a, b) => a.team.name.localeCompare(b.team.name));
}

/** Same check the form runs: names are unique within an academy, ignoring case. */
export function isTeamNameTaken(academyId: Id, name: string): boolean {
  const wanted = name.trim().toLowerCase();
  return academyTeams(academyId).some(
    (team) => team.name.toLowerCase() === wanted
  );
}

/**
 * Real: `authClient.organization.createTeam({ name, organizationId, ageGroup, sport })`,
 * then `organization.addTeamMember` for each coach.
 */
export async function createTeam(input: CreateTeamInput): Promise<Team> {
  await fixtureDelay();
  const name = input.name.trim();
  if (isTeamNameTaken(input.academyId, name)) {
    throw new Error(`You already have a team called ${name}.`);
  }
  const team: Team = {
    id: `team-${crypto.randomUUID()}`,
    academyId: input.academyId,
    name,
    ageGroup: input.ageGroup?.trim() || null,
    createdAt: new Date().toISOString(),
  };
  createdTeams.push(team);
  if (input.sport) {
    createdTeamSports[team.id] = input.sport;
  }
  await Promise.all(
    (input.coachUserIds ?? []).map((userId) =>
      addTeamMember(input.academyId, { teamId: team.id, userId })
    )
  );
  return team;
}
