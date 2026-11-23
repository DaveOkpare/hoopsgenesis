/*
 * Owner support tools (story PA-2): find anyone on the platform and act on the account.
 * Data-layer convention: see features/viewer/api.ts. Account actions are Better Auth's
 * admin plugin (`authClient.admin.*`); a person's academies come from
 * `GET /api/v1/admin/users/:userId/memberships`.
 */
import type { AcademyRole, Id, Timestamp, User } from "@/features/types";
import { parseRoles } from "@/features/viewer/api";
import { apiAll, apiData, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

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
  /** Everyone on the platform but platform owners (for an empty search). */
  total: number;
  users: PlatformUser[];
}

export interface UserSession {
  id: Id;
  updatedAt: Timestamp;
  userAgent: string;
  userId: Id;
}

export interface ImpersonationResult {
  /** Where to go next: the person's home (`/app` redirects to it from the session). */
  home: "/admin" | "/coach" | "/student" | "/app";
  startedAt: Timestamp;
}

/** Results shown per search. Each needs one memberships call, so keep it small. */
const SEARCH_LIMIT = 50;
const PLATFORM_ADMIN_ROLE = "admin";
const BRAND_PREFIX = /^hoops\s+genesis\s+/i;

interface MembershipsDto {
  memberships: {
    academy: { id: Id; name: string; slug: string };
    roles: string[];
    teams: { id: Id; name: string }[];
  }[];
}

type AuthUser = Record<string, unknown> & { id: string };

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

function toPlatformUser(
  raw: AuthUser,
  memberships: PlatformUserMembership[]
): PlatformUser {
  const dateOfBirth = raw.dateOfBirth
    ? toIso(raw.dateOfBirth).slice(0, 10)
    : null;
  return {
    id: raw.id,
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    image: (raw.image as string | null | undefined) ?? null,
    banned: raw.banned === true,
    banReason: (raw.banReason as string | null | undefined) ?? null,
    createdAt: toIso(raw.createdAt),
    dateOfBirth,
    phone: (raw.phone as string | null | undefined) ?? null,
    platformRole: raw.role === PLATFORM_ADMIN_ROLE ? "admin" : "user",
    memberships,
  };
}

/** Academy id -> time zone, for the country dot on each membership chip. */
async function academyTimeZones(): Promise<Map<Id, string>> {
  const rows = await apiAll<{ id: Id; timezone: string }>("/admin/academies");
  return new Map(rows.map((row) => [row.id, row.timezone]));
}

async function membershipsOf(
  userId: Id,
  timeZones: Map<Id, string>
): Promise<PlatformUserMembership[]> {
  const { memberships } = await apiData<MembershipsDto>(
    `/admin/users/${encodeURIComponent(userId)}/memberships`
  );
  return memberships.map((m) => ({
    academyId: m.academy.id,
    academyShortName:
      m.academy.name.replace(BRAND_PREFIX, "") || m.academy.name,
    roles: parseRoles(m.roles.join(",")),
    teamNames: m.teams.map((team) => team.name),
    timezone: timeZones.get(m.academy.id) ?? "UTC",
  }));
}

/** Everyone but platform owners, optionally matching one field. */
async function searchUsers(field?: "name" | "email", value?: string) {
  return unwrapAuth(
    await authClient.admin.listUsers({
      query: {
        limit: SEARCH_LIMIT,
        sortBy: "name",
        sortDirection: "asc",
        filterField: "role",
        filterOperator: "ne",
        filterValue: PLATFORM_ADMIN_ROLE,
        ...(field && value
          ? {
              searchField: field,
              searchOperator: "contains",
              searchValue: value,
            }
          : {}),
      },
    })
  );
}

/**
 * Search people by name or email across every academy:
 * `authClient.admin.listUsers` (one field per call, so name and email are searched
 * separately and merged; platform owners are filtered out), then
 * `GET /api/v1/admin/users/:userId/memberships` per result. The search is
 * case-sensitive on names (Better Auth's `contains`); emails are searched lowercased.
 */
export async function listUsers(params: {
  searchValue: string;
}): Promise<ListUsersResult> {
  if (mock) {
    return (await mock()).listUsers(params);
  }
  const needle = params.searchValue.trim();
  const [everyone, byName, byEmail, timeZones] = await Promise.all([
    searchUsers(),
    needle ? searchUsers("name", needle) : null,
    needle ? searchUsers("email", needle.toLowerCase()) : null,
    academyTimeZones(),
  ]);
  const found = new Map<Id, AuthUser>();
  const lists = needle
    ? [byName?.users ?? [], byEmail?.users ?? []]
    : [everyone.users];
  for (const list of lists) {
    for (const user of list as unknown as AuthUser[]) {
      found.set(user.id, user);
    }
  }
  const rows = [...found.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
  const memberships = await Promise.all(
    rows.map((row) => membershipsOf(row.id, timeZones))
  );
  return {
    users: rows.map((row, index) =>
      toPlatformUser(row, memberships[index] ?? [])
    ),
    total: everyone.total,
  };
}

/** `authClient.admin.listUserSessions({ userId })`, most recently used first. */
export async function listUserSessions(userId: Id): Promise<UserSession[]> {
  if (mock) {
    return (await mock()).listUserSessions(userId);
  }
  const { sessions } = unwrapAuth(
    await authClient.admin.listUserSessions({ userId })
  );
  return sessions
    .map((session) => ({
      id: session.id,
      userId: session.userId,
      userAgent: session.userAgent ?? "",
      updatedAt: toIso(session.updatedAt),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * `authClient.admin.banUser({ userId, banReason })`. Better Auth also revokes the
 * person's sessions. Note: the server writes no audit_log row for bans.
 */
export async function banUser(input: {
  banReason: string;
  userId: Id;
}): Promise<PlatformUser> {
  if (mock) {
    return (await mock()).banUser(input);
  }
  const { user } = unwrapAuth(
    await authClient.admin.banUser({
      userId: input.userId,
      banReason: input.banReason,
    })
  );
  return toPlatformUser(user as unknown as AuthUser, []);
}

/**
 * `authClient.admin.unbanUser({ userId })`. Better Auth takes no reason and the server
 * writes no audit_log row for it, so the reason typed in the dialog is not stored.
 */
export async function unbanUser(input: {
  reason: string;
  userId: Id;
}): Promise<PlatformUser> {
  if (mock) {
    return (await mock()).unbanUser(input);
  }
  const { user } = unwrapAuth(
    await authClient.admin.unbanUser({ userId: input.userId })
  );
  return toPlatformUser(user as unknown as AuthUser, []);
}

/**
 * `authClient.admin.revokeUserSessions({ userId })`. Better Auth answers only
 * `{ success }`, so the count is the sessions listed just before.
 */
export async function revokeUserSessions(input: {
  userId: Id;
}): Promise<{ revoked: number }> {
  if (mock) {
    return (await mock()).revokeUserSessions(input);
  }
  const before = await listUserSessions(input.userId);
  unwrapAuth(
    await authClient.admin.revokeUserSessions({ userId: input.userId })
  );
  return { revoked: before.length };
}

/**
 * `authClient.admin.impersonateUser({ userId })`: the browser's session becomes the
 * person's (with `impersonatedBy` set). The caller drops cached queries and opens
 * `/app`, which redirects to their home. Better Auth's after hook writes
 * `user.impersonate_start` to the audit log.
 */
export async function impersonateUser(input: {
  userId: Id;
}): Promise<ImpersonationResult> {
  if (mock) {
    return (await mock()).impersonateUser(input);
  }
  const { session } = unwrapAuth(
    await authClient.admin.impersonateUser({ userId: input.userId })
  );
  return { home: "/app", startedAt: toIso(session.createdAt) };
}
