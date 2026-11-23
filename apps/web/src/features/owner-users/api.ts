/*
 * Owner support tools (story PA-2): find anyone on the platform and act on the account.
 * Every function stands in for a Better Auth admin plugin call (`authClient.admin.*`).
 * Follows the mock-data convention in features/viewer/api.ts; the store below starts
 * from fixtures and is changed by the mutations.
 */
import {
  academies,
  fixtureDelay,
  members,
  teams,
  users,
} from "@/features/fixtures";
import {
  PLATFORM_USER_TOTAL,
  type SessionFixture,
  sessions as sessionFixtures,
} from "@/features/owner-users/fixtures";
import type { AcademyRole, Id, Timestamp, User } from "@/features/types";

export interface PlatformUserMembership {
  academyId: Id;
  /** "Kigali" */
  academyShortName: string;
  roles: AcademyRole[];
  teamNames: string[];
  timezone: string;
}

/** `admin.listUsers` row plus the person's academies (from `member`). */
export interface PlatformUser extends User {
  banReason: string | null;
  memberships: PlatformUserMembership[];
}

export interface ListUsersResult {
  total: number;
  users: PlatformUser[];
}

export type UserSession = SessionFixture;

function membershipsOf(userId: Id): PlatformUserMembership[] {
  return members
    .filter((m) => m.userId === userId)
    .flatMap((m) => {
      const academy = academies.find((a) => a.id === m.academyId);
      if (!academy) {
        return [];
      }
      return [
        {
          academyId: academy.id,
          academyShortName: academy.shortName,
          timezone: academy.timezone,
          roles: m.roles,
          teamNames: teams
            .filter((t) => m.teamIds.includes(t.id))
            .map((t) => t.name),
        },
      ];
    });
}

const userStore: PlatformUser[] = users
  .filter((u) => u.platformRole !== "admin")
  .map((u) => ({ ...u, banReason: null, memberships: membershipsOf(u.id) }));

let sessionStore: UserSession[] = [...sessionFixtures];

function findUser(userId: Id): PlatformUser {
  const found = userStore.find((u) => u.id === userId);
  if (!found) {
    throw new Error(`User ${userId} was not found`);
  }
  return found;
}

/**
 * Search people by name or email across every academy.
 * Real: `authClient.admin.listUsers({ query: { searchValue, searchField, limit } })`
 * (searched on name and email) + their `member` rows.
 */
export async function listUsers(params: {
  searchValue: string;
}): Promise<ListUsersResult> {
  await fixtureDelay();
  const needle = params.searchValue.trim().toLowerCase();
  const matches = userStore
    .filter(
      (u) =>
        !needle ||
        u.name.toLowerCase().includes(needle) ||
        u.email.toLowerCase().includes(needle)
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  return {
    users: matches.map((u) => ({ ...u })),
    total: needle ? matches.length : PLATFORM_USER_TOTAL,
  };
}

/** Real: `authClient.admin.listUserSessions({ userId })`. */
export async function listUserSessions(userId: Id): Promise<UserSession[]> {
  await fixtureDelay();
  return sessionStore
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * Real: `authClient.admin.banUser({ userId, banReason })`. Better Auth also revokes the
 * person's sessions. The server writes the platform audit log entry.
 */
export async function banUser(input: {
  banReason: string;
  userId: Id;
}): Promise<PlatformUser> {
  await fixtureDelay();
  const target = findUser(input.userId);
  target.banned = true;
  target.banReason = input.banReason;
  sessionStore = sessionStore.filter((s) => s.userId !== input.userId);
  return { ...target };
}

/**
 * Real: `authClient.admin.unbanUser({ userId })`; the reason goes to the platform
 * audit log entry the server writes.
 */
export async function unbanUser(input: {
  reason: string;
  userId: Id;
}): Promise<PlatformUser> {
  await fixtureDelay();
  const target = findUser(input.userId);
  target.banned = false;
  target.banReason = null;
  return { ...target };
}

/** Real: `authClient.admin.revokeUserSessions({ userId })`. Returns how many ended. */
export async function revokeUserSessions(input: {
  userId: Id;
}): Promise<{ revoked: number }> {
  await fixtureDelay();
  const before = sessionStore.length;
  sessionStore = sessionStore.filter((s) => s.userId !== input.userId);
  return { revoked: before - sessionStore.length };
}

const ROLE_HOME: Record<AcademyRole, "/admin" | "/coach" | "/student"> = {
  admin: "/admin",
  coach: "/coach",
  student: "/student",
};
const ROLE_PRIORITY: AcademyRole[] = ["admin", "coach", "student"];

/**
 * Real: `authClient.admin.impersonateUser({ userId })`, then the app reloads the
 * session and opens that person's home. Returns where to go.
 */
export async function impersonateUser(input: {
  userId: Id;
}): Promise<{ home: "/admin" | "/coach" | "/student"; startedAt: Timestamp }> {
  await fixtureDelay();
  const target = findUser(input.userId);
  const roles = target.memberships.flatMap((m) => m.roles);
  const role = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "student";
  return { home: ROLE_HOME[role], startedAt: new Date().toISOString() };
}
