/*
 * Who is in an academy and on which team, read from the real server. Shared by the
 * members, teams, team page, dashboard and setup api.ts files (real mode only; their
 * api.mock.ts files never call this module).
 *
 * - Members and their user rows: Better Auth `organization.getFullOrganization`.
 * - Teams with counts: `GET /api/v1/academies/:id/teams` (Better Auth's listTeams has no
 *   counts). Rosters: `GET /teams/:teamId/members` (Better Auth's listTeamMembers refuses
 *   academy admins who are not on the team).
 * - Invitations: Better Auth `organization.listInvitations` (academy admins only; the
 *   server strips admin invitations and refuses everyone else).
 */
import type {
  AcademyRole,
  Id,
  Invitation,
  InvitationStatus,
  Member,
  Team,
  Timestamp,
} from "@/features/types";
import { parseRoles } from "@/features/viewer/api";
import { academyPath, apiAll, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

/** One row of `GET /teams`. */
export interface ApiTeam extends Team {
  coachCount: number;
  memberCount: number;
  studentCount: number;
  updatedAt: Timestamp | null;
}

/** One row of `GET /teams/:teamId/members`. */
export interface RosterMember {
  image: string | null;
  name: string;
  roles: AcademyRole[];
  userId: Id;
}

/** Enough members for any academy we run; Better Auth's default page is 100. */
const MEMBERS_LIMIT = 2000;

export async function fetchTeams(academyId: Id): Promise<ApiTeam[]> {
  return await apiAll<ApiTeam>(academyPath(academyId, "/teams"));
}

export async function fetchTeamRoster(
  academyId: Id,
  teamId: Id
): Promise<RosterMember[]> {
  const rows = await apiAll<Omit<RosterMember, "roles"> & { roles: string[] }>(
    academyPath(academyId, `/teams/${encodeURIComponent(teamId)}/members`)
  );
  return rows.map((row) => ({
    ...row,
    roles: parseRoles(row.roles.join(",")),
  }));
}

/** Every visible team with its roster. */
export async function fetchTeamsWithRosters(
  academyId: Id
): Promise<{ teams: ApiTeam[]; rosters: Map<Id, RosterMember[]> }> {
  const teams = await fetchTeams(academyId);
  const rosterList = await Promise.all(
    teams.map((team) => fetchTeamRoster(academyId, team.id))
  );
  const rosters = new Map<Id, RosterMember[]>(
    teams.map((team, index) => [team.id, rosterList[index] ?? []])
  );
  return { teams, rosters };
}

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

/** The academy's IANA time zone (Better Auth organization additional field). */
export async function fetchAcademyTimeZone(academyId: Id): Promise<string> {
  const org = unwrapAuth(
    await authClient.organization.getFullOrganization({
      query: { organizationId: academyId, membersLimit: 1 },
    })
  );
  return org?.timezone ?? "UTC";
}

/** Better Auth members of the academy, without team ids. */
export async function fetchOrgMembers(academyId: Id): Promise<Member[]> {
  const org = unwrapAuth(
    await authClient.organization.getFullOrganization({
      query: { organizationId: academyId, membersLimit: MEMBERS_LIMIT },
    })
  );
  return (org?.members ?? []).map((member) => ({
    id: member.id,
    academyId,
    userId: member.userId,
    roles: parseRoles(member.role),
    createdAt: toIso(member.createdAt),
    teamIds: [],
    user: {
      id: member.user.id,
      name: member.user.name,
      email: member.user.email,
      image: member.user.image ?? null,
    },
  }));
}

/** Members with the teams they are on (from the rosters). */
export async function fetchMembersWithTeams(
  academyId: Id
): Promise<{ members: Member[]; teams: ApiTeam[] }> {
  const [members, { teams, rosters }] = await Promise.all([
    fetchOrgMembers(academyId),
    fetchTeamsWithRosters(academyId),
  ]);
  const teamIdsByUser = new Map<Id, Id[]>();
  for (const team of teams) {
    for (const row of rosters.get(team.id) ?? []) {
      teamIdsByUser.set(row.userId, [
        ...(teamIdsByUser.get(row.userId) ?? []),
        team.id,
      ]);
    }
  }
  return {
    teams,
    members: members.map((member) => ({
      ...member,
      teamIds: teamIdsByUser.get(member.userId) ?? [],
    })),
  };
}

function toInvitation(
  academyId: Id,
  raw: Record<string, unknown>,
  now: number
): Invitation {
  const [role = "student"] = parseRoles(String(raw.role ?? ""));
  const expiresAt = toIso(raw.expiresAt);
  const stored = String(raw.status ?? "pending") as InvitationStatus;
  const status: InvitationStatus =
    stored === "pending" && Date.parse(expiresAt) <= now ? "expired" : stored;
  const teamId = typeof raw.teamId === "string" ? raw.teamId : null;
  return {
    id: String(raw.id),
    academyId,
    email: String(raw.email ?? ""),
    role,
    status,
    inviterId: String(raw.inviterId ?? ""),
    // Several teams are stored comma-separated; invites here carry at most one.
    teamId: teamId ? (teamId.split(",")[0] ?? null) : null,
    createdAt: toIso(raw.createdAt),
    expiresAt,
  };
}

/** Every invitation of the academy the caller may see (academy admins only). */
export async function fetchInvitations(academyId: Id): Promise<Invitation[]> {
  const rows = unwrapAuth(
    await authClient.organization.listInvitations({
      query: { organizationId: academyId },
    })
  );
  const now = Date.now();
  return (rows ?? []).map((row) =>
    toInvitation(academyId, row as unknown as Record<string, unknown>, now)
  );
}

/** Pending and expired invitations, newest first. */
export async function fetchOpenInvitations(
  academyId: Id
): Promise<Invitation[]> {
  const all = await fetchInvitations(academyId);
  return all
    .filter(
      (invite) => invite.status === "pending" || invite.status === "expired"
    )
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}
