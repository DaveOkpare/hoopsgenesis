/*
 * Preview-mode (fixture) implementation of features/owner-users/api.ts. Dev only.
 * The store below starts from fixtures and is changed by the mutations.
 */
import {
  academies,
  FIXTURE_NOW,
  fixtureDelay,
  members,
  teams,
  users,
} from "@/features/fixtures";
import type {
  ImpersonationResult,
  ListUsersResult,
  PlatformUser,
  PlatformUserMembership,
  UserSession,
} from "@/features/owner-users/api";
import {
  fillerPeople,
  membershipOverrides,
  PLATFORM_USER_TOTAL,
  sessions as sessionFixtures,
} from "@/features/owner-users/fixtures";
import type { AcademyRole, Id } from "@/features/types";

function membershipsOf(userId: Id): PlatformUserMembership[] {
  const override = membershipOverrides[userId];
  if (override) {
    return override.map((m) => ({ ...m, roles: [...m.roles] }));
  }
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
          academyName: academy.name,
          academyShortName: academy.shortName,
          joinedAt: m.createdAt,
          timezone: academy.timezone,
          roles: m.roles,
          teamNames: teams
            .filter((t) => m.teamIds.includes(t.id))
            .map((t) => t.name),
        },
      ];
    });
}

const userStore: PlatformUser[] = [
  ...users
    .filter((u) => u.platformRole !== "admin")
    .map((u) => ({ ...u, banReason: null, memberships: membershipsOf(u.id) })),
  ...fillerPeople(PLATFORM_USER_TOTAL - users.length + 1),
];

let sessionStore: UserSession[] = [...sessionFixtures];

function findUser(userId: Id): PlatformUser {
  const found = userStore.find((u) => u.id === userId);
  if (!found) {
    throw new Error(`User ${userId} was not found`);
  }
  return found;
}

function copy(user: PlatformUser): PlatformUser {
  return {
    ...user,
    memberships: user.memberships.map((m) => ({ ...m, roles: [...m.roles] })),
  };
}

/** Real: `authClient.admin.listUsers` (paged; name and email searched) + memberships. */
export async function listUsers(params: {
  searchValue: string;
  offset: number;
  limit: number;
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
    users: matches.slice(params.offset, params.offset + params.limit).map(copy),
    matched: matches.length,
    total: userStore.length,
  };
}

/** Real: `authClient.admin.getUser` + memberships. */
export async function getPlatformUser(
  userId: Id
): Promise<PlatformUser | null> {
  await fixtureDelay();
  const found = userStore.find((u) => u.id === userId);
  return found ? copy(found) : null;
}

/** Real: `authClient.admin.listUserSessions({ userId })`. */
export async function listUserSessions(userId: Id): Promise<UserSession[]> {
  await fixtureDelay();
  return sessionStore
    .filter((s) => s.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** Real: `authClient.admin.banUser({ userId, banReason })`; sessions are revoked. */
export async function banUser(input: {
  banReason: string;
  userId: Id;
}): Promise<PlatformUser> {
  await fixtureDelay();
  const target = findUser(input.userId);
  target.banned = true;
  target.banReason = input.banReason;
  sessionStore = sessionStore.filter((s) => s.userId !== input.userId);
  return copy(target);
}

/** Real: `authClient.admin.unbanUser({ userId })`. */
export async function unbanUser(input: { userId: Id }): Promise<PlatformUser> {
  await fixtureDelay();
  const target = findUser(input.userId);
  target.banned = false;
  target.banReason = null;
  return copy(target);
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

/** Real: `authClient.admin.impersonateUser({ userId })`. Returns where to go. */
export async function impersonateUser(input: {
  userId: Id;
}): Promise<ImpersonationResult> {
  await fixtureDelay();
  const target = findUser(input.userId);
  const roles = target.memberships.flatMap((m) => m.roles);
  const role = ROLE_PRIORITY.find((r) => roles.includes(r)) ?? "student";
  return { home: ROLE_HOME[role], startedAt: FIXTURE_NOW.toISOString() };
}

/**
 * Keeps a person's memberships in step with the academies mock's admin changes, so
 * the person page updates after "Make admin" / "Remove as admin" in preview.
 */
export function applyAdminChange(input: {
  academy: { id: Id; name: string; shortName: string; timezone: string };
  userId: Id;
  isAdmin: boolean;
}): void {
  const target = userStore.find((u) => u.id === input.userId);
  if (!target) {
    return;
  }
  const existing = target.memberships.find(
    (m) => m.academyId === input.academy.id
  );
  if (input.isAdmin) {
    if (existing) {
      existing.roles = [
        "admin",
        ...existing.roles.filter((r) => r !== "admin"),
      ];
    } else {
      target.memberships.push({
        academyId: input.academy.id,
        academyName: input.academy.name,
        academyShortName: input.academy.shortName,
        joinedAt: FIXTURE_NOW.toISOString(),
        roles: ["admin"],
        teamNames: [],
        timezone: input.academy.timezone,
      });
    }
    return;
  }
  if (existing) {
    existing.roles = existing.roles.filter((r) => r !== "admin");
    if (existing.roles.length === 0) {
      target.memberships = target.memberships.filter((m) => m !== existing);
    }
  }
}
