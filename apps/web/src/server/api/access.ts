/**
 * The access checks every `/api/v1` handler runs, in order:
 *
 * 1. authenticate      no session                  -> 401
 * 2. membership        no member row for academy   -> 404 (never reveal it exists)
 * 3. permission        role lacks resource:action  -> 403
 * 4. scope             see ./scope.ts
 *
 * `requireAcademyAccess` runs 1 to 3 for academy routes; `requirePlatformAdmin`
 * guards `/api/v1/admin/*`. `requireAcademyReadAccess` gives the platform
 * owner a read-only view of any academy (`/api/v1/admin/academies/:id/*`
 * GETs): the same handlers run with a member that sees the whole academy and
 * passes no write check (roles.ts `toAcademyViewer`).
 *
 * Sessions: `auth.api.getSession({ headers })` reads Better Auth's session
 * cookie. The web app sends it automatically; the Expo app sends the same
 * cookie as a `cookie` header (`authClient.getCookie()`), so no bearer plugin
 * is needed.
 */
import { z } from "zod";

import { auth, db } from "../../services";
import { ForbiddenError, NotFoundError, UnauthorizedError } from "./errors";
import type { ApiContext } from "./handler";
import {
  type AcademyMember,
  type AcademyPermissions,
  hasAcademyPermission,
  parseRoles,
  toAcademyMember,
  toAcademyViewer,
} from "./roles";
import { idSchema, parseParams } from "./validation";

export type ApiSession = NonNullable<
  Awaited<ReturnType<typeof auth.api.getSession>>
>;

export interface Academy {
  attendanceRadiusM: number;
  defaultCurrency: string;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  slug: string;
  /** IANA time zone; "today" and date filters are evaluated here. */
  timezone: string;
}

export interface AcademyAccess {
  academy: Academy;
  member: AcademyMember;
  session: ApiSession;
}

/**
 * How a handler gets its caller, academy and member. Handlers that serve
 * both academy members and the platform owner's read-only view take one of
 * these (`requireAcademyAccess` with permissions, or
 * `requireAcademyReadAccess`) instead of calling a check directly.
 */
export type AcademyAccessResolver = (ctx: ApiContext) => Promise<AcademyAccess>;

const PLATFORM_ADMIN_ROLE = "admin";
const DEFAULT_ATTENDANCE_RADIUS_M = 150;
const academyIdParamsSchema = z.object({ academyId: idSchema });

/** Check 1: a Better Auth session from the cookie header, else 401. */
export const authenticate = async (request: Request): Promise<ApiSession> => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session) {
    throw new UnauthorizedError();
  }
  return session;
};

const academySelect = {
  id: true,
  name: true,
  slug: true,
  timezone: true,
  defaultCurrency: true,
  latitude: true,
  longitude: true,
  attendanceRadiusM: true,
} as const;

const toAcademy = (organization: {
  attendanceRadiusM: number | null;
  defaultCurrency: string;
  id: string;
  latitude: number;
  longitude: number;
  name: string;
  slug: string;
  timezone: string;
}): Academy => ({
  ...organization,
  attendanceRadiusM:
    organization.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M,
});

/** Check 2: the caller's member row and the academy, else 404. */
export const requireAcademyMember = async (
  session: ApiSession,
  academyId: string
): Promise<{ member: AcademyMember; academy: Academy }> => {
  const row = await db.member.findUnique({
    where: {
      organizationId_userId: {
        organizationId: academyId,
        userId: session.user.id,
      },
    },
    select: {
      id: true,
      userId: true,
      organizationId: true,
      role: true,
      organization: { select: academySelect },
    },
  });
  if (!row) {
    throw new NotFoundError("Academy not found");
  }
  const { organization, ...memberRow } = row;
  return {
    member: toAcademyMember(memberRow),
    academy: toAcademy(organization),
  };
};

/** Check 3: the member's roles grant `permissions`, else 403. */
export const requirePermission = (
  member: AcademyMember,
  permissions: AcademyPermissions
): void => {
  if (!hasAcademyPermission(member.roles, permissions)) {
    throw new ForbiddenError();
  }
};

/**
 * Checks 1 to 3 for a route under `/api/v1/academies/$academyId`. Leave out
 * `permissions` only for endpoints any member may call.
 */
export const requireAcademyAccess = async (
  { request, params }: ApiContext,
  permissions?: AcademyPermissions
): Promise<AcademyAccess> => {
  const session = await authenticate(request);
  const { academyId } = parseParams(academyIdParamsSchema, params);
  const { member, academy } = await requireAcademyMember(session, academyId);
  if (permissions) {
    requirePermission(member, permissions);
  }
  return { session, member, academy };
};

export const isPlatformAdmin = (session: ApiSession): boolean =>
  parseRoles(session.user.role).includes(PLATFORM_ADMIN_ROLE);

/**
 * Guard for `/api/v1/admin/*`: signed in (401) with `user.role` including
 * `admin` (403). Platform admins skip membership and permission checks only
 * on these routes, never on academy routes.
 */
export const requirePlatformAdmin = async (
  request: Request
): Promise<ApiSession> => {
  const session = await authenticate(request);
  if (!isPlatformAdmin(session)) {
    throw new ForbiddenError("Platform admins only");
  }
  return session;
};

/**
 * The platform owner's read-only view of an academy, for GET routes under
 * `/api/v1/admin/academies/$academyId`: signed in (401), `user.role` admin
 * (403), the academy exists (404). The member is `toAcademyViewer`: it sees
 * the whole academy (scope "all") and has no roles, so every `isAdmin`,
 * `isCoach` and permission check refuses it. Mount it on GET routes only.
 */
export const requireAcademyReadAccess: AcademyAccessResolver = async ({
  request,
  params,
}) => {
  const session = await requirePlatformAdmin(request);
  const { academyId } = parseParams(academyIdParamsSchema, params);
  const organization = await db.organization.findUnique({
    where: { id: academyId },
    select: academySelect,
  });
  if (!organization) {
    throw new NotFoundError("Academy not found");
  }
  return {
    session,
    member: toAcademyViewer(organization.id, session.user.id),
    academy: toAcademy(organization),
  };
};

/** A resolver for academy routes: `requireAcademyAccess` with `permissions`. */
export const academyAccessWith =
  (permissions?: AcademyPermissions): AcademyAccessResolver =>
  (ctx) =>
    requireAcademyAccess(ctx, permissions);
