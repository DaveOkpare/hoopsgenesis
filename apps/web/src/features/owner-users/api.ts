/*
 * Owner support tools (story PA-2): find anyone on the platform and act on the account.
 * Data-layer convention: see features/viewer/api.ts. Account actions are Better Auth's
 * admin plugin (`authClient.admin.*`); a person's academies come from
 * `GET /api/v1/admin/users/:userId/memberships`.
 *
 * What the server records: impersonation start and stop are written to the audit log
 * (Better Auth after hook). Bans, unbans and "sign out everywhere" are NOT: Better
 * Auth keeps only the ban itself and its reason on the user row (`banReason`).
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
  /** "Hoops Genesis Kigali" */
  academyName: string;
  /** "Kigali" */
  academyShortName: string;
  joinedAt: Timestamp;
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
  /** People matching the search (everyone but platform owners when it is empty). */
  matched: number;
  /** Everyone on the platform but platform owners. */
  total: number;
  /** This page of `matched`. */
  users: PlatformUser[];
}

export interface UserSession {
  createdAt: Timestamp;
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

/** Most matches a search merges (name and email searched separately). */
const SEARCH_CAP = 200;
const PLATFORM_ADMIN_ROLE = "admin";
const BRAND_PREFIX = /^hoops\s+genesis\s+/i;

interface MembershipsDto {
  memberships: {
    academy: { id: Id; name: string; slug: string };
    joinedAt: Timestamp;
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

/** Academy id -> time zone, for the country dot on each membership. */
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
    academyName: m.academy.name,
    academyShortName:
      m.academy.name.replace(BRAND_PREFIX, "") || m.academy.name,
    joinedAt: m.joinedAt,
    roles: parseRoles(m.roles.join(",")),
    teamNames: m.teams.map((team) => team.name),
    timezone: timeZones.get(m.academy.id) ?? "UTC",
  }));
}

/** Everyone but platform owners, optionally matching one field. */
async function searchUsers(options: {
  field?: "name" | "email";
  value?: string;
  limit: number;
  offset?: number;
}) {
  const { field, value, limit, offset = 0 } = options;
  return unwrapAuth(
    await authClient.admin.listUsers({
      query: {
        limit,
        offset,
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

interface UserRowsPage {
  matched: number;
  rows: AuthUser[];
  total: number;
}

async function plainPage(offset: number, limit: number): Promise<UserRowsPage> {
  const page = await searchUsers({ limit, offset });
  return {
    rows: page.users as unknown as AuthUser[],
    matched: page.total,
    total: page.total,
  };
}

async function searchPage(
  needle: string,
  offset: number,
  limit: number
): Promise<UserRowsPage> {
  const [everyone, byName, byEmail] = await Promise.all([
    searchUsers({ limit: 1 }),
    searchUsers({ field: "name", value: needle, limit: SEARCH_CAP }),
    searchUsers({
      field: "email",
      value: needle.toLowerCase(),
      limit: SEARCH_CAP,
    }),
  ]);
  const found = new Map<Id, AuthUser>();
  for (const user of [
    ...(byName.users as unknown as AuthUser[]),
    ...(byEmail.users as unknown as AuthUser[]),
  ]) {
    found.set(user.id, user);
  }
  const merged = [...found.values()].sort((a, b) =>
    String(a.name).localeCompare(String(b.name))
  );
  return {
    rows: merged.slice(offset, offset + limit),
    matched: merged.length,
    total: everyone.total,
  };
}

/**
 * One page of people, by name, across every academy: `authClient.admin.listUsers`,
 * then `GET /api/v1/admin/users/:userId/memberships` per person on the page.
 * - No search: the server pages (`offset`, `limit`) and counts (`total`).
 * - A search: Better Auth searches one field per call, so name and email are searched
 *   separately (up to 200 matches each), merged, and paged here. Names match
 *   case-sensitively (Better Auth's `contains`); emails are searched lowercased.
 */
export async function listUsers(params: {
  searchValue: string;
  offset: number;
  limit: number;
}): Promise<ListUsersResult> {
  if (mock) {
    return (await mock()).listUsers(params);
  }
  const needle = params.searchValue.trim();
  const timeZonesPromise = academyTimeZones();
  const { rows, matched, total } = needle
    ? await searchPage(needle, params.offset, params.limit)
    : await plainPage(params.offset, params.limit);
  const timeZones = await timeZonesPromise;
  const memberships = await Promise.all(
    rows.map((row) => membershipsOf(row.id, timeZones))
  );
  return {
    users: rows.map((row, index) =>
      toPlatformUser(row, memberships[index] ?? [])
    ),
    matched,
    total,
  };
}

/**
 * One person for their page: `authClient.admin.getUser({ query: { id } })` and
 * `GET /api/v1/admin/users/:userId/memberships`. Null when there is no such user.
 */
export async function getPlatformUser(
  userId: Id
): Promise<PlatformUser | null> {
  if (mock) {
    return (await mock()).getPlatformUser(userId);
  }
  const [result, timeZones] = await Promise.all([
    authClient.admin.getUser({ query: { id: userId } }),
    academyTimeZones(),
  ]);
  if (result.error?.status === 404 || !result.data) {
    if (result.error && result.error.status !== 404) {
      unwrapAuth(result);
    }
    return null;
  }
  const raw = result.data as unknown as AuthUser;
  return toPlatformUser(raw, await membershipsOf(userId, timeZones));
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
      createdAt: toIso(session.createdAt),
      updatedAt: toIso(session.updatedAt),
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/**
 * `authClient.admin.banUser({ userId, banReason })`. Better Auth stores the reason on
 * the account (`banReason`, shown on the person's page) and revokes their sessions.
 * No audit_log row is written.
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

/** `authClient.admin.unbanUser({ userId })`. Takes no reason; no audit_log row. */
export async function unbanUser(input: { userId: Id }): Promise<PlatformUser> {
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
 * `{ success }`, so the count is the sessions listed just before. No audit_log row.
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
 * person's for one hour (with `impersonatedBy` set). The caller drops cached queries
 * and opens `/app`, which redirects to their home. Better Auth's after hook writes
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
