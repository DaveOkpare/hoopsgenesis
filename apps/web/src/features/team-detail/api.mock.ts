/*
 * Preview-mode (fixture) implementation of features/team-detail/api.ts. Dev only.
 * Team page (AO-3, CO-7, CO-10) and the "U14 this month" table on coach Today.
 */
import { fixtureDelay, teams } from "@/features/fixtures";
import { formatResult } from "@/features/results/templates";
import type {
  MemberCandidate,
  TeamDetail,
  TeamFeeStatus,
} from "@/features/team-detail/api";
import {
  academyMembers,
  outstandingFees,
  progressFor,
  pronouns,
  rosterOrder,
  teamSport,
} from "@/features/team-detail/fixtures";
import { createdTeamSports, createdTeams } from "@/features/teams/store";
import type { DateOnly, Id, Member, Team } from "@/features/types";

const MS_PER_DAY = 86_400_000;
const NOT_LISTED = 999;

/** A person found by "Add a student to U14" / "Add a coach". */
/** Fixture teams plus any made with "Create team" this session (features/teams/store). */
function knownTeams(): Team[] {
  return [...teams, ...createdTeams];
}

function teamOf(academyId: Id, teamId: Id): Team {
  const team = knownTeams().find(
    (t) => t.id === teamId && t.academyId === academyId
  );
  if (!team) {
    throw new Error("Team not found");
  }
  return team;
}

function daysOverdue(dueDate: DateOnly, today: DateOnly): number {
  return Math.round(
    (new Date(`${today}T12:00:00Z`).getTime() -
      new Date(`${dueDate}T12:00:00Z`).getTime()) /
      MS_PER_DAY
  );
}

function endOfMonth(today: DateOnly): DateOnly {
  const [year, month] = today.split("-").map(Number);
  const last = new Date(Date.UTC(year ?? 2026, month ?? 1, 0));
  return last.toISOString().slice(0, 10);
}

function feeStatus(studentId: Id, today: DateOnly): TeamFeeStatus {
  const owed = outstandingFees.find((f) => f.studentId === studentId);
  if (owed) {
    const days = daysOverdue(owed.dueDate, today);
    if (days > 0) {
      return { kind: "overdue", days };
    }
  }
  return { kind: "paid", paidTo: endOfMonth(today) };
}

function byRosterOrder(a: Member, b: Member): number {
  const ia = rosterOrder.indexOf(a.userId);
  const ib = rosterOrder.indexOf(b.userId);
  return (ia === -1 ? NOT_LISTED : ia) - (ib === -1 ? NOT_LISTED : ib);
}

/**
 * Team with its students, coaches, attendance this month and fee status (read-only).
 * Real: organization.listTeamMembers + GET /teams/:teamId/attendance-summary
 * + GET /fees/outstanding?teamId= + latest verified GET /students/:id/records?recordType=athletic.
 */
export async function getTeamDetail(
  academyId: Id,
  teamId: Id,
  params: { today: DateOnly }
): Promise<TeamDetail> {
  await fixtureDelay();
  const team = teamOf(academyId, teamId);
  const onTeam = academyMembers
    .filter((m) => m.academyId === academyId && m.teamIds.includes(teamId))
    .sort(byRosterOrder);
  return {
    team,
    sport: teamSport[teamId] ?? createdTeamSports[teamId] ?? null,
    students: onTeam
      .filter((m) => m.roles.includes("student"))
      .map((m) => {
        const progress = progressFor(m.userId);
        return {
          user: m.user,
          attendancePercent: progress.attendancePercent,
          lastSessionOn: progress.lastSessionOn,
          latestResult: progress.latestResult
            ? formatResult(progress.latestResult)
            : null,
          fee: feeStatus(m.userId, params.today),
        };
      }),
    coaches: onTeam
      .filter((m) => m.roles.includes("coach"))
      .map((m) => ({ user: m.user })),
  };
}

/**
 * Academy members to add to a team, matching a name or email.
 * Real: organization.getFullOrganization (members + teams), filtered on the client.
 */
export async function searchMembersForTeam(
  academyId: Id,
  params: { teamId: Id; query: string; role: "student" | "coach" }
): Promise<MemberCandidate[]> {
  await fixtureDelay();
  const query = params.query.trim().toLowerCase();
  if (!query) {
    return [];
  }
  return academyMembers
    .filter(
      (m) =>
        m.academyId === academyId &&
        m.roles.includes(params.role) &&
        !m.teamIds.includes(params.teamId) &&
        (m.user.name.toLowerCase().includes(query) ||
          m.user.email.toLowerCase().startsWith(query))
    )
    .map((m) => {
      const current =
        knownTeams().find((t) => m.teamIds.includes(t.id)) ?? null;
      return {
        user: m.user,
        role: params.role,
        pronoun: pronouns[m.userId] ?? "they",
        currentTeam:
          params.role === "student" && current
            ? { id: current.id, name: current.name }
            : null,
      };
    });
}

function memberOf(academyId: Id, userId: Id): Member {
  const found = academyMembers.find(
    (m) => m.userId === userId && m.academyId === academyId
  );
  if (!found) {
    throw new Error("Member not found");
  }
  return found;
}

/**
 * Add someone to a team. A student already on another team is moved: Better Auth's
 * one-team-per-student hook means the client removes them from the old team first.
 * Real: organization.removeTeamMember (old team, students only) + organization.addTeamMember.
 */
export async function addTeamMember(
  academyId: Id,
  input: { teamId: Id; userId: Id; fromTeamId?: Id | null }
): Promise<{ movedFrom: Id | null }> {
  await fixtureDelay();
  const member = memberOf(academyId, input.userId);
  let movedFrom: Id | null = null;
  if (member.roles.includes("student")) {
    movedFrom = member.teamIds.find((id) => id !== input.teamId) ?? null;
    member.teamIds = [];
  }
  if (!member.teamIds.includes(input.teamId)) {
    member.teamIds.push(input.teamId);
  }
  return { movedFrom };
}

/** Real: organization.removeTeamMember. */
export async function removeTeamMember(
  academyId: Id,
  input: { teamId: Id; userId: Id }
): Promise<void> {
  await fixtureDelay();
  const member = memberOf(academyId, input.userId);
  member.teamIds = member.teamIds.filter((id) => id !== input.teamId);
}
