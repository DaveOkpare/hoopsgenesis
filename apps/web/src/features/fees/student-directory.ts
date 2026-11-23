/*
 * Names and teams for the fee, record and activity screens. Fee and audit rows carry
 * only user ids for the student they are about, so these screens look people up here:
 *
 *   Better Auth `organization.listMembers`   every member with name and role
 *   GET /academies/:id/teams                 the teams the caller can see
 *   GET /academies/:id/teams/:teamId/members each roster (a student is on one team)
 *
 * Results are kept for a short while per academy so one screen's several queries share
 * them. Real mode only: preview mocks never call this module.
 */
import type { Academy, AcademyRole, Id } from "@/features/types";
import { parseRoles, toAcademy } from "@/features/viewer/api";
import { academyPath, apiAll, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";

export interface DirectoryTeam {
  ageGroup: string | null;
  /** Roster members with the coach role (who reviews the team's records). */
  coachIds: Id[];
  id: Id;
  name: string;
}

export interface DirectoryPerson {
  id: Id;
  image: string | null;
  joinedAt: string | null;
  name: string;
  roles: AcademyRole[];
  teamId: Id | null;
  teamName: string | null;
}

export interface StudentDirectory {
  /** Everyone named on the roster or the member list, by user id. */
  people: Map<Id, DirectoryPerson>;
  teams: DirectoryTeam[];
}

interface ServerTeam {
  ageGroup: string | null;
  id: Id;
  name: string;
}

interface RosterMember {
  image: string | null;
  name: string;
  roles: AcademyRole[];
  userId: Id;
}

const TTL_MS = 30_000;
const MEMBER_LIMIT = 1000;

const cache = new Map<Id, { at: number; value: Promise<StudentDirectory> }>();

async function loadMembers(academyId: Id): Promise<DirectoryPerson[]> {
  const result = unwrapAuth(
    await authClient.organization.listMembers({
      query: { organizationId: academyId, limit: MEMBER_LIMIT },
    })
  );
  return (result?.members ?? []).map((member) => ({
    id: member.userId,
    name: member.user.name,
    image: member.user.image ?? null,
    roles: parseRoles(member.role),
    joinedAt:
      member.createdAt instanceof Date
        ? member.createdAt.toISOString()
        : String(member.createdAt ?? ""),
    teamId: null,
    teamName: null,
  }));
}

async function buildDirectory(academyId: Id): Promise<StudentDirectory> {
  const [teams, members] = await Promise.all([
    apiAll<ServerTeam>(academyPath(academyId, "/teams")),
    loadMembers(academyId),
  ]);
  const rosters = await Promise.all(
    teams.map((team) =>
      apiAll<RosterMember>(academyPath(academyId, `/teams/${team.id}/members`))
    )
  );
  const people = new Map<Id, DirectoryPerson>(members.map((m) => [m.id, m]));
  teams.forEach((team, index) => {
    for (const member of rosters[index] ?? []) {
      const known = people.get(member.userId);
      const person: DirectoryPerson = known ?? {
        id: member.userId,
        name: member.name,
        image: member.image,
        roles: member.roles,
        joinedAt: null,
        teamId: null,
        teamName: null,
      };
      // Coaches can be on several teams; the first (by name) is enough for a label.
      if (!person.teamId) {
        person.teamId = team.id;
        person.teamName = team.name;
      }
      people.set(member.userId, person);
    }
  });
  return {
    people,
    teams: teams.map(({ id, name, ageGroup }, index) => ({
      id,
      name,
      ageGroup,
      coachIds: (rosters[index] ?? [])
        .filter((member) => member.roles.includes("coach"))
        .map((member) => member.userId),
    })),
  };
}

export function loadStudentDirectory(academyId: Id): Promise<StudentDirectory> {
  const hit = cache.get(academyId);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return hit.value;
  }
  const value = buildDirectory(academyId);
  cache.set(academyId, { at: Date.now(), value });
  value.catch(() => cache.delete(academyId));
  return value;
}

/** Drop the cached directory (after a roster change). */
export function forgetStudentDirectory(academyId: Id): void {
  cache.delete(academyId);
}

export function personName(
  directory: StudentDirectory,
  id: Id | null | undefined
): string | null {
  return id ? (directory.people.get(id)?.name ?? null) : null;
}

const academyCache = new Map<Id, Promise<Academy | null>>();

/** The academy row (time zone, currency, radius) from the caller's academies. */
export function loadAcademy(academyId: Id): Promise<Academy | null> {
  const hit = academyCache.get(academyId);
  if (hit) {
    return hit;
  }
  const value = authClient.organization.list().then((result) => {
    const org = unwrapAuth(result)?.find((o) => o.id === academyId);
    return org ? toAcademy(org as unknown as Record<string, unknown>) : null;
  });
  academyCache.set(academyId, value);
  value.catch(() => academyCache.delete(academyId));
  return value;
}
