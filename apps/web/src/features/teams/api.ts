/*
 * Teams list and create-team for the academy admin (story AO-3, Paper 72W-0, 75J-0, 7DB-0).
 * Follows the mock-data convention in features/viewer/api.ts: these return fixtures
 * today; swap the bodies for the calls named on each function.
 * Rosters, coaches and sports are read from the team page's fixtures
 * (features/team-detail) so the list, the team page and their mutations agree.
 */
import { fixtureDelay, teams as teamFixtures } from "@/features/fixtures";
import { listInvitations } from "@/features/members/api";
import { addTeamMember } from "@/features/team-detail/api";
import { academyMembers, teamSport } from "@/features/team-detail/fixtures";
import { teamAttendancePercent } from "@/features/teams/fixtures";
import { createdTeamSports, createdTeams } from "@/features/teams/store";
import type { Id, Invitation, Team, UserSummary } from "@/features/types";

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
  /** "Basketball", "Football"; null when not set (not in the schema yet). */
  sport: string | null;
  studentCount: number;
  team: Team;
}

/** An academy coach who can be put on a new team. */
export interface CoachCandidate {
  memberId: Id;
  user: UserSummary;
}

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
    .map((m) => ({ memberId: m.id, user: m.user }));
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
    .map((m) => ({ memberId: m.id, user: m.user }))
    .sort((a, b) => byName(a.user, b.user));
}

export interface CreateTeamInput {
  academyId: Id;
  ageGroup: string | null;
  /** Coaches to put on the team (member ids). */
  coachMemberIds?: Id[];
  name: string;
  /** null for "Other". */
  sport?: string | null;
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
    (input.coachMemberIds ?? []).map((memberId) =>
      addTeamMember(input.academyId, { teamId: team.id, memberId })
    )
  );
  return team;
}
