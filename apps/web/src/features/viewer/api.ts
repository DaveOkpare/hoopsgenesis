/*
 * DATA-LAYER CONVENTION (copy this for every feature)
 *
 *   src/features/<feature>/api.ts       typed async functions, one per endpoint, calling the
 *                                       real server: `lib/api-client.ts` for /api/v1 and
 *                                       `lib/auth-client.ts` for Better Auth.
 *   src/features/<feature>/api.mock.ts  the fixture implementation with the same exports,
 *                                       used only in dev preview (see lib/preview.ts). Only
 *                                       mock modules import fixtures.
 *   src/features/<feature>/queries.ts   TanStack Query `queryOptions` + mutation hooks that
 *                                       call api.ts. Components only import from here.
 *
 * Rules:
 * - Shapes follow the server (camelCase, ISO dates, money as strings). Shared types live in
 *   src/features/types.ts; feature-only types live in api.ts.
 * - Mutations return what the endpoint returns; queries.ts updates or invalidates the cache.
 * - Academy-scoped query keys start with ["academies", academyId, "<resource>", ...params].
 */
import type {
  Academy,
  AcademyRole,
  Id,
  Team,
  Timestamp,
  User,
  UserSummary,
} from "@/features/types";
import { ApiError, unwrapAuth } from "@/lib/api-client";
import { authClient } from "@/lib/auth-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface Membership {
  academy: Academy;
  roles: AcademyRole[];
  /** Teams this person is on (coach: teams they coach; student: their team). */
  teams: Pick<Team, "id" | "name">[];
}

/** Set while the owner is "viewing as" someone (Better Auth admin impersonation). */
export interface Impersonation {
  by: UserSummary;
  startedAt: Timestamp;
}

/** Everything the app chrome needs about the signed-in person. */
export interface Viewer {
  /** session.activeOrganizationId */
  activeAcademyId: Id | null;
  impersonation: Impersonation | null;
  memberships: Membership[];
  user: User;
}

/** Who to show in preview mode, picked from the URL (see src/lib/preview.ts). */
export type ViewerPersona = "admin" | "owner" | "coach" | "student";

const ACADEMY_ROLES: readonly AcademyRole[] = ["admin", "coach", "student"];
const BRAND_PREFIX = /^hoops\s+genesis\s+/i;

/** "Hoops Genesis Kigali" -> "Kigali": the short name phones show. */
export function academyShortName(name: string): string {
  const short = name.replace(BRAND_PREFIX, "").trim();
  return short || name;
}

/** `member.role` ("coach,student") as academy roles, unknown names dropped. */
export function parseRoles(role: string | null | undefined): AcademyRole[] {
  return (role ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part): part is AcademyRole =>
      ACADEMY_ROLES.includes(part as AcademyRole)
    );
}

const toIso = (value: unknown): string =>
  value instanceof Date ? value.toISOString() : String(value ?? "");

const toDateOnly = (value: unknown): string | null => {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  return toIso(value).slice(0, "YYYY-MM-DD".length);
};

/** A Better Auth organization row (with our additional fields) as an Academy. */
export function toAcademy(org: Record<string, unknown>): Academy {
  const name = String(org.name ?? "");
  return {
    id: String(org.id),
    name,
    shortName: academyShortName(name),
    slug: String(org.slug ?? ""),
    logo: (org.logo as string | null | undefined) ?? null,
    location: (org.location as string | null | undefined) ?? null,
    timezone: String(org.timezone ?? "UTC"),
    defaultCurrency: String(org.defaultCurrency ?? ""),
    latitude: Number(org.latitude ?? 0),
    longitude: Number(org.longitude ?? 0),
    attendanceRadiusM: Number(org.attendanceRadiusM ?? 0),
    createdAt: toIso(org.createdAt),
  };
}

function toUser(raw: Record<string, unknown>): User {
  return {
    id: String(raw.id),
    name: String(raw.name ?? ""),
    email: String(raw.email ?? ""),
    image: (raw.image as string | null | undefined) ?? null,
    banned: raw.banned === true,
    createdAt: toIso(raw.createdAt),
    dateOfBirth: toDateOnly(raw.dateOfBirth),
    phone: (raw.phone as string | null | undefined) ?? null,
    platformRole: raw.role === "admin" ? "admin" : "user",
  };
}

/*
 * Better Auth's session names the impersonating owner only by id, and the impersonated
 * user may not read other users. The owner's name is kept in sessionStorage when the
 * owner starts impersonating (owner-users), and read back here for the banner.
 */
const IMPERSONATOR_KEY = "hoops.impersonator";

export function rememberImpersonator(owner: UserSummary): void {
  try {
    sessionStorage.setItem(IMPERSONATOR_KEY, JSON.stringify(owner));
  } catch {
    // Storage can be unavailable (private mode); the banner then says "the owner".
  }
}

function readImpersonator(ownerId: Id): UserSummary {
  try {
    const raw = sessionStorage.getItem(IMPERSONATOR_KEY);
    const stored = raw ? (JSON.parse(raw) as UserSummary) : null;
    if (stored?.id === ownerId) {
      return stored;
    }
  } catch {
    // Fall through to the generic name.
  }
  return { id: ownerId, name: "the platform owner", email: "", image: null };
}

async function loadMemberships(): Promise<Membership[]> {
  const [orgs, userTeams] = await Promise.all([
    authClient.organization.list().then(unwrapAuth),
    // Without arguments: the caller's teams across every academy.
    authClient.organization.listUserTeams().then(unwrapAuth),
  ]);
  const roles = await Promise.all(
    (orgs ?? []).map((org) =>
      authClient.organization
        .getActiveMemberRole({ query: { organizationId: org.id } })
        .then(unwrapAuth)
    )
  );
  const memberships = (orgs ?? []).map((org, index) => ({
    academy: toAcademy(org as unknown as Record<string, unknown>),
    roles: parseRoles(roles[index]?.role),
    teams: (userTeams ?? [])
      .filter((team) => team.organizationId === org.id)
      .map((team) => ({ id: team.id, name: team.name })),
  }));
  // Oldest academy first, so a fresh session (no active academy yet) lands somewhere
  // predictable rather than wherever the list happened to put it.
  return memberships.sort((a, b) =>
    a.academy.createdAt.localeCompare(b.academy.createdAt)
  );
}

/**
 * The signed-in person, their academies and the active academy.
 * `authClient.getSession()` (user, session.activeOrganizationId, impersonatedBy), then
 * `organization.list()`, `organization.listUserTeams()` and
 * `organization.getActiveMemberRole({ organizationId })` per academy. The platform owner
 * is never an academy member, so they have no memberships.
 */
export async function fetchViewer(): Promise<Viewer> {
  if (mock) {
    return (await mock()).fetchViewer();
  }
  const result = unwrapAuth(await authClient.getSession());
  if (!result) {
    throw new ApiError({
      status: 401,
      code: "unauthorized",
      message: "Not signed in",
    });
  }
  const user = toUser(result.user as unknown as Record<string, unknown>);
  const session = result.session as unknown as Record<string, unknown>;
  const impersonatedBy = session.impersonatedBy as string | null | undefined;
  const memberships =
    user.platformRole === "admin" ? [] : await loadMemberships();
  const stored = (session.activeOrganizationId as string | null) ?? null;
  const activeAcademyId = memberships.some((m) => m.academy.id === stored)
    ? stored
    : (memberships[0]?.academy.id ?? null);
  if (activeAcademyId && activeAcademyId !== stored) {
    // Keep Better Auth's active academy in step with what the app shows.
    await authClient.organization.setActive({
      organizationId: activeAcademyId,
    });
  }
  return {
    user,
    memberships,
    activeAcademyId,
    impersonation: impersonatedBy
      ? {
          by: readImpersonator(impersonatedBy),
          startedAt: toIso(session.createdAt),
        }
      : null,
  };
}

/** `authClient.organization.setActive({ organizationId })`. */
export async function setActiveAcademy(input: {
  academyId: Id;
}): Promise<{ activeAcademyId: Id }> {
  if (mock) {
    return (await mock()).setActiveAcademy(input);
  }
  unwrapAuth(
    await authClient.organization.setActive({
      organizationId: input.academyId,
    })
  );
  return { activeAcademyId: input.academyId };
}

/** `authClient.admin.stopImpersonating()`: back to the owner's own session. */
export async function stopImpersonating(): Promise<void> {
  if (mock) {
    return (await mock()).stopImpersonating();
  }
  unwrapAuth(await authClient.admin.stopImpersonating());
  try {
    sessionStorage.removeItem(IMPERSONATOR_KEY);
  } catch {
    // Nothing to clean up.
  }
}

/** `authClient.signOut()`. */
export async function signOut(): Promise<void> {
  if (mock) {
    return;
  }
  unwrapAuth(await authClient.signOut());
}
