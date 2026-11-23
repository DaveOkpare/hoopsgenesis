import { expo } from "@better-auth/expo";
import type { Database } from "@hoops-genesis/db";
import { type BetterAuthPlugin, betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from "better-auth/api";
import { admin, organization } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";

import {
  createQrNonce,
  DEFAULT_ATTENDANCE_RADIUS_M,
  findAcademyLocationProblem,
} from "./academy-fields";
import { organizationSchema, userAdditionalFields } from "./additional-fields";
import {
  COACH_ROLE,
  hasRole,
  isOnAnotherTeam as isOnAnotherTeamIn,
  isPlatformAdminUser,
  isValidAcademyRoleList,
  ONE_TEAM_PER_STUDENT_MESSAGE,
  PLATFORM_ADMIN_NOT_MEMBER_MESSAGE,
  PLATFORM_ADMIN_ROLE,
  STUDENT_ROLE,
  splitRoles,
  UNKNOWN_ROLE_MESSAGE,
} from "./membership-rules";
import { ACADEMY_ADMIN_ROLE, ac, academyRoles } from "./permissions";

export interface AuthConfig {
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}

const OWN_TEAMS_ONLY_MESSAGE =
  "Only an academy admin can change a team you are not on";
const STUDENTS_ONLY_MESSAGE =
  "Coaches add and remove only students; ask an academy admin";
const ADMINS_ONLY_MESSAGE = "Only an academy admin can do this";
const PLATFORM_OWNER_ONLY_MESSAGE =
  "Only the platform owner appoints or removes academy admins";
const INVITABLE_ROLES_MESSAGE =
  "Academy admins invite only coaches and students";
const MAX_USER_AGENT_LENGTH = 512;
const PLATFORM_ADMIN_HAS_MEMBERSHIPS_MESSAGE =
  "This user belongs to academies; remove those memberships before making them a platform admin";

const ADD_TEAM_MEMBER_PATH = "/organization/add-team-member";
const REMOVE_TEAM_MEMBER_PATH = "/organization/remove-team-member";
const UPDATE_TEAM_PATH = "/organization/update-team";
const INVITE_MEMBER_PATH = "/organization/invite-member";
const IMPERSONATE_PATH = "/admin/impersonate-user";
const SET_ROLE_PATH = "/admin/set-role";
const UPDATE_USER_PATH = "/admin/update-user";
const STOP_IMPERSONATING_PATH = "/admin/stop-impersonating";
const LIST_INVITATIONS_PATH = "/organization/list-invitations";
const GET_FULL_ORGANIZATION_PATH = "/organization/get-full-organization";

/** Roster changes: coaches only on teams they are on, only for students. */
const ROSTER_PATHS = new Set([ADD_TEAM_MEMBER_PATH, REMOVE_TEAM_MEMBER_PATH]);

/**
 * Endpoints that change a team or its roster. Better Auth checks the role's
 * permission; the before hook adds "only on teams you are on" for anyone who
 * is not an academy admin.
 */
const TEAM_SCOPED_PATHS = new Set([...ROSTER_PATHS, UPDATE_TEAM_PATH]);

/**
 * Endpoints coaches can reach through `member:update` / `member:delete`
 * (granted only for rosters) that must stay admin-only.
 */
const ADMIN_ONLY_MEMBER_PATHS = new Set([
  "/organization/update-member-role",
  "/organization/remove-member",
]);

const isAcademyAdmin = (roles: string | null | undefined): boolean =>
  hasRole(roles, ACADEMY_ADMIN_ROLE);

/**
 * Better Auth 1.7.12 accepts its built-in `owner` and `member` role names on
 * invitations and role changes even when `roles` leaves them out, so every
 * path that sets a role checks against ours.
 */
const assertAcademyRoles = (roles: string | readonly string[]): void => {
  if (!isValidAcademyRoleList(roles)) {
    throw badRequest(UNKNOWN_ROLE_MESSAGE);
  }
};

const badRequest = (message: string): APIError =>
  new APIError("BAD_REQUEST", { message });

const forbidden = (message: string): APIError =>
  new APIError("FORBIDDEN", { message });

const assertValidAcademyLocation = (fields: Record<string, unknown>): void => {
  const problem = findAcademyLocationProblem(fields);
  if (problem) {
    throw badRequest(problem);
  }
};

const readString = (body: unknown, key: string): string | undefined => {
  if (typeof body !== "object" || body === null) {
    return;
  }
  const value: unknown = (body as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
};

const readObject = (value: unknown, key: string): unknown =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)[key]
    : undefined;

/** The ip and user agent columns of an audit_log row, from request headers. */
const requestMeta = (
  headers: Headers | undefined
): { ip: string | null; userAgent: string | null } => {
  const forwarded = headers?.get("x-forwarded-for")?.split(",")[0];
  const ip = forwarded?.trim() || headers?.get("x-real-ip")?.trim();
  return {
    ip: ip || null,
    userAgent:
      headers?.get("user-agent")?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
  };
};

export function createAuth(
  env: AuthConfig,
  database: Database,
  extraTrustedOrigins: readonly string[] = []
) {
  /** Is the user on any team of the academy other than `exceptTeamId`? */
  const isOnAnotherTeam = (
    userId: string,
    academyId: string,
    exceptTeamId?: string
  ): Promise<boolean> =>
    isOnAnotherTeamIn(database, userId, academyId, exceptTeamId);

  /** Platform admins act through /api/v1/admin/*, never as academy members. */
  const isPlatformAdmin = (where: {
    id?: string;
    email?: string;
  }): Promise<boolean> => isPlatformAdminUser(database, where);

  const assertNotPlatformAdmin = async (where: {
    id?: string;
    email?: string;
  }): Promise<void> => {
    if (await isPlatformAdmin(where)) {
      throw forbidden(PLATFORM_ADMIN_NOT_MEMBER_MESSAGE);
    }
  };

  /**
   * admin.setRole / admin.updateUser granting the platform `admin` role to
   * someone who is still an academy member: refused (their memberships are
   * never deleted behind anyone's back; remove them first).
   */
  const assertMayBecomePlatformAdmin = async (
    path: string,
    body: unknown
  ): Promise<void> => {
    const userId = readString(body, "userId");
    const role: unknown =
      path === SET_ROLE_PATH
        ? readObject(body, "role")
        : readObject(readObject(body, "data"), "role");
    const roles =
      typeof role === "string" || Array.isArray(role)
        ? splitRoles(role as string | string[])
        : [];
    if (!(userId && roles.includes(PLATFORM_ADMIN_ROLE))) {
      return;
    }
    const membership = await database.member.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (membership) {
      throw forbidden(PLATFORM_ADMIN_HAS_MEMBERSHIPS_MESSAGE);
    }
  };

  const countTeamsInAcademy = (
    userId: string,
    academyId: string
  ): Promise<number> =>
    database.teamMember.count({
      where: { userId, team: { organizationId: academyId } },
    });

  const findMemberRole = async (
    academyId: string,
    userId: string
  ): Promise<string | null> => {
    const row = await database.member.findUnique({
      where: { organizationId_userId: { organizationId: academyId, userId } },
      select: { role: true },
    });
    return row?.role ?? null;
  };

  /**
   * Anyone who is not an academy admin (in practice, a coach) may change a
   * team or its roster only if they are on that team themselves, and may add
   * or remove only students (not coaches or admins). Better Auth has already
   * checked the role's permission and checks that the person is a member of
   * the academy.
   */
  const assertMayChangeTeam = async (
    path: string,
    actorId: string,
    teamId: string,
    targetUserId: string | undefined
  ): Promise<void> => {
    const team = await database.team.findUnique({
      where: { id: teamId },
      select: { organizationId: true },
    });
    if (!team) {
      // Let Better Auth answer with its own "team not found".
      return;
    }
    const actorRole = await findMemberRole(team.organizationId, actorId);
    if (actorRole === null || isAcademyAdmin(actorRole)) {
      // Non-members are rejected by Better Auth; admins are unrestricted.
      return;
    }
    const actorOnTeam = await database.teamMember.findFirst({
      where: { teamId, userId: actorId },
      select: { id: true },
    });
    if (!actorOnTeam) {
      throw forbidden(OWN_TEAMS_ONLY_MESSAGE);
    }
    if (!(ROSTER_PATHS.has(path) && targetUserId)) {
      return;
    }
    const targetRole = await findMemberRole(team.organizationId, targetUserId);
    if (targetRole === null) {
      // Better Auth answers "not a member of the organization".
      return;
    }
    const targetIsStudentOnly =
      hasRole(targetRole, STUDENT_ROLE) &&
      !hasRole(targetRole, COACH_ROLE) &&
      !isAcademyAdmin(targetRole);
    if (!targetIsStudentOnly) {
      throw forbidden(STUDENTS_ONLY_MESSAGE);
    }
  };

  /**
   * updateMemberRole and removeMember: academy admins only. Coaches hold
   * `member:update` / `member:delete` for rosters, which Better Auth would
   * otherwise also accept here.
   */
  const assertActorIsAcademyAdmin = async (
    actorId: string,
    academyId: string | null | undefined
  ): Promise<void> => {
    if (!academyId) {
      // Better Auth answers "no active organization".
      return;
    }
    const actorRole = await findMemberRole(academyId, actorId);
    if (actorRole !== null && !isAcademyAdmin(actorRole)) {
      throw forbidden(ADMINS_ONLY_MESSAGE);
    }
  };

  /**
   * inviteMember with `resend: true` extends a pending invitation without
   * calling beforeCreateInvitation, so an admin invitation (issued by the
   * platform owner) is guarded here.
   */
  const assertNotResendingAdminInvitation = async (
    body: unknown,
    academyId: string | null | undefined
  ): Promise<void> => {
    const email = readString(body, "email")?.toLowerCase();
    const resend =
      typeof body === "object" &&
      body !== null &&
      (body as Record<string, unknown>).resend === true;
    if (!(resend && email && academyId)) {
      return;
    }
    const pending = await database.invitation.findMany({
      where: { organizationId: academyId, email, status: "pending" },
      select: { role: true },
    });
    if (pending.some((invitation) => isAcademyAdmin(invitation.role))) {
      throw forbidden(PLATFORM_OWNER_ONLY_MESSAGE);
    }
  };

  /**
   * Invitation ids are the secret in an invitation link, so only academy
   * admins see them, and only for coach and student invitations (admin
   * invitations are the platform owner's). Everyone else gets none.
   */
  const visibleInvitations = async (
    actorId: string | undefined,
    academyId: string | null | undefined,
    invitations: unknown
  ): Promise<unknown[]> => {
    if (!(actorId && academyId && Array.isArray(invitations))) {
      return [];
    }
    const actorRole = await findMemberRole(academyId, actorId);
    if (!isAcademyAdmin(actorRole)) {
      return [];
    }
    return invitations.filter((invitation: unknown) => {
      const role = readObject(invitation, "role");
      return !(typeof role === "string" && hasRole(role, ACADEMY_ADMIN_ROLE));
    });
  };

  /**
   * One audit_log row per roster change made through Better Auth. Written
   * after Better Auth has committed the teamMember change, so not in the same
   * transaction: if this insert fails the caller gets a 500 and the roster
   * change stays.
   */
  const writeRosterAudit = async (input: {
    path: string;
    actorId: string;
    /** The platform owner, when the actor is being impersonated. */
    impersonatedById: string | null;
    teamId: string;
    userId: string;
    returned: unknown;
    headers: Headers | undefined;
  }): Promise<void> => {
    const team = await database.team.findUnique({
      where: { id: input.teamId },
      select: { organizationId: true },
    });
    if (!team) {
      return;
    }
    const isAdd = input.path === ADD_TEAM_MEMBER_PATH;
    const row = { teamId: input.teamId, userId: input.userId };
    await database.auditLog.create({
      data: {
        academyId: team.organizationId,
        actorId: input.actorId,
        impersonatedById: input.impersonatedById,
        action: isAdd ? "team.member_add" : "team.member_remove",
        entityType: "team",
        entityId: input.teamId,
        before: isAdd ? undefined : row,
        after: isAdd
          ? JSON.parse(JSON.stringify(input.returned ?? row))
          : undefined,
        ...requestMeta(input.headers),
      },
    });
  };

  /**
   * user.impersonate_start / user.impersonate_stop rows (platform-level, so
   * academy_id is null). actor_id is the platform owner, entity_id the user
   * impersonated. Only ids and the session's expiry are stored, never a
   * session token. Written after Better Auth has created or deleted the
   * impersonation session, not in its transaction.
   */
  const writeImpersonationAudit = async (input: {
    action: "user.impersonate_start" | "user.impersonate_stop";
    ownerId: string;
    userId: string;
    expiresAt: unknown;
    headers: Headers | undefined;
  }): Promise<void> => {
    const snapshot = {
      userId: input.userId,
      impersonatedBy: input.ownerId,
      ...(input.expiresAt instanceof Date || typeof input.expiresAt === "string"
        ? { expiresAt: new Date(input.expiresAt).toISOString() }
        : {}),
    };
    const isStart = input.action === "user.impersonate_start";
    await database.auditLog.create({
      data: {
        academyId: null,
        actorId: input.ownerId,
        action: input.action,
        entityType: "user",
        entityId: input.userId,
        before: isStart ? undefined : snapshot,
        after: isStart ? snapshot : undefined,
        ...requestMeta(input.headers),
      },
    });
  };

  /**
   * Keeps invitation ids (the secret in an invitation link) with academy
   * admins. In 1.7.12 any member may call list-invitations and
   * get-full-organization, and both return every invitation with its id.
   */
  const invitationPrivacy = {
    id: "invitation-privacy",
    hooks: {
      before: [
        {
          matcher: (ctx: { path?: string }) =>
            ctx.path === LIST_INVITATIONS_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const session = await getSessionFromCtx(ctx);
            if (session) {
              await assertActorIsAcademyAdmin(
                session.user.id,
                readString(ctx.query, "organizationId") ??
                  session.session.activeOrganizationId
              );
            }
          }),
        },
      ],
      after: [
        {
          matcher: (ctx: { path?: string }) =>
            ctx.path === LIST_INVITATIONS_PATH ||
            ctx.path === GET_FULL_ORGANIZATION_PATH,
          handler: createAuthMiddleware(async (ctx) => {
            const { returned } = ctx.context;
            if (
              isAPIError(returned) ||
              typeof returned !== "object" ||
              returned === null
            ) {
              return;
            }
            const session = await getSessionFromCtx(ctx);
            if (ctx.path === LIST_INVITATIONS_PATH) {
              return ctx.json(
                await visibleInvitations(
                  session?.user.id,
                  readString(ctx.query, "organizationId") ??
                    session?.session.activeOrganizationId,
                  returned
                )
              );
            }
            // Clients use get-full-organization for members and teams: keep
            // those, strip invitations for everyone but the academy's admins.
            return ctx.json({
              ...returned,
              invitations: await visibleInvitations(
                session?.user.id,
                readString(returned, "id"),
                readObject(returned, "invitations")
              ),
            });
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin;

  return betterAuth({
    database: prismaAdapter(database, {
      provider: "postgresql",
    }),
    trustedOrigins: [
      env.BETTER_AUTH_URL,
      ...extraTrustedOrigins,
      "hoops-genesis://",
      "exp://",
      "http://localhost:8081",
    ],
    emailAndPassword: { enabled: true },
    user: {
      additionalFields: userAdditionalFields,
    },
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    hooks: {
      // Both run for HTTP requests and auth.api.* calls alike.
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === SET_ROLE_PATH || ctx.path === UPDATE_USER_PATH) {
          await assertMayBecomePlatformAdmin(ctx.path, ctx.body);
          return;
        }
        const isTeamPath = TEAM_SCOPED_PATHS.has(ctx.path);
        const isAdminOnlyPath = ADMIN_ONLY_MEMBER_PATHS.has(ctx.path);
        const isInvitePath = ctx.path === INVITE_MEMBER_PATH;
        if (!(isTeamPath || isAdminOnlyPath || isInvitePath)) {
          return;
        }
        const session = await getSessionFromCtx(ctx);
        if (!session) {
          // Better Auth rejects the request itself.
          return;
        }
        const academyId =
          readString(ctx.body, "organizationId") ??
          session.session.activeOrganizationId;
        if (isAdminOnlyPath) {
          await assertActorIsAcademyAdmin(session.user.id, academyId);
          return;
        }
        if (isInvitePath) {
          await assertNotResendingAdminInvitation(ctx.body, academyId);
          return;
        }
        const teamId = readString(ctx.body, "teamId");
        if (teamId) {
          await assertMayChangeTeam(
            ctx.path,
            session.user.id,
            teamId,
            readString(ctx.body, "userId")
          );
        }
      }),
      // Roster changes and impersonation are audited (schema doc, Rules:
      // Audit; API endpoints: "the owner uses impersonation, which the audit
      // log records").
      after: createAuthMiddleware(async (ctx) => {
        if (isAPIError(ctx.context.returned)) {
          return;
        }
        const headers = ctx.request?.headers ?? ctx.headers;
        if (ctx.path === IMPERSONATE_PATH) {
          // The new impersonation session: userId is the user, impersonatedBy the owner.
          const created = readObject(ctx.context.returned, "session");
          const userId = readString(created, "userId");
          const ownerId = readString(created, "impersonatedBy");
          if (userId && ownerId) {
            await writeImpersonationAudit({
              action: "user.impersonate_start",
              ownerId,
              userId,
              expiresAt: readObject(created, "expiresAt"),
              headers,
            });
          }
          return;
        }
        if (ctx.path === STOP_IMPERSONATING_PATH) {
          // The endpoint read the impersonation session (and deleted it);
          // getSessionFromCtx cached it on the context.
          const ended = ctx.context.session?.session;
          if (ended?.impersonatedBy) {
            await writeImpersonationAudit({
              action: "user.impersonate_stop",
              ownerId: ended.impersonatedBy,
              userId: ended.userId,
              expiresAt: ended.expiresAt,
              headers,
            });
          }
          return;
        }
        if (!ROSTER_PATHS.has(ctx.path)) {
          return;
        }
        const teamId = readString(ctx.body, "teamId");
        const userId = readString(ctx.body, "userId");
        const session = await getSessionFromCtx(ctx);
        if (!(teamId && userId && session)) {
          return;
        }
        await writeRosterAudit({
          path: ctx.path,
          actorId: session.user.id,
          impersonatedById: session.session.impersonatedBy ?? null,
          teamId,
          userId,
          returned: ctx.context.returned,
          headers,
        });
      }),
    },
    plugins: [
      expo(),
      admin(),
      organization({
        ac,
        roles: academyRoles,
        // Better Auth's "creator" role. It is used for its last-creator checks
        // (the last admin cannot leave) and for "only a creator may grant the
        // creator role"; the hooks below go further and keep every admin
        // change with the platform owner. Nobody holds Better Auth's `owner`.
        creatorRole: ACADEMY_ADMIN_ROLE,
        // No default team: Better Auth would put the creator on a team named
        // after the academy.
        teams: { enabled: true, defaultTeam: { enabled: false } },
        schema: organizationSchema,
        // Academies are created and deleted only by the platform owner
        // through /api/v1/admin/academies, which writes the rows itself so
        // the owner never becomes a member. Better Auth's own create and
        // delete endpoints are closed to everyone.
        allowUserToCreateOrganization: false,
        disableOrganizationDeletion: true,
        organizationHooks: {
          // The QR nonce is always generated here; clients cannot send it
          // (input: false strips it from the request body).
          beforeCreateOrganization: ({ organization: academy }) => {
            const attendanceRadiusM: unknown =
              academy.attendanceRadiusM ?? DEFAULT_ATTENDANCE_RADIUS_M;
            assertValidAcademyLocation({ ...academy, attendanceRadiusM });
            // Better Auth merges `data` over the validated request body.
            return Promise.resolve({
              data: { attendanceRadiusM, qrNonce: createQrNonce() },
            });
          },
          beforeUpdateOrganization: ({ organization: academy }) => {
            assertValidAcademyLocation(academy);
            return Promise.resolve();
          },
          // Server-only addMember (and organization create): only our
          // roles, and never a platform admin.
          beforeAddMember: async ({ member }) => {
            assertAcademyRoles(member.role);
            await assertNotPlatformAdmin({ id: member.userId });
          },
          // Academy admins invite coaches and students only; admins are
          // appointed by the platform owner, who writes those invitations
          // directly. A student can't be invited onto several teams at once.
          beforeCreateInvitation: async ({ invitation }) => {
            assertAcademyRoles(invitation.role);
            // The platform owner reads academies through /api/v1/admin/*.
            await assertNotPlatformAdmin({ email: invitation.email });
            if (hasRole(invitation.role, ACADEMY_ADMIN_ROLE)) {
              throw forbidden(INVITABLE_ROLES_MESSAGE);
            }
            // In 1.7.12 the hook gets only the first team as `teamId`; the full
            // list is passed (undocumented) as `teamIds`.
            const teamIds: unknown = invitation.teamIds;
            const teamCount = Array.isArray(teamIds) ? teamIds.length : 0;
            if (hasRole(invitation.role, STUDENT_ROLE) && teamCount > 1) {
              throw badRequest(ONE_TEAM_PER_STUDENT_MESSAGE);
            }
          },
          // Cancelling a pending admin invitation is the platform owner's.
          beforeCancelInvitation: ({ invitation }) => {
            if (isAcademyAdmin(invitation.role)) {
              throw forbidden(PLATFORM_OWNER_ONLY_MESSAGE);
            }
            return Promise.resolve();
          },
          // Accepting an invitation adds the user to its team(s) directly,
          // without beforeAddTeamMember, so the one-team rule is checked here.
          // The role check refuses old invitations with Better Auth's roles.
          beforeAcceptInvitation: async ({
            invitation,
            user,
            organization: academy,
          }) => {
            assertAcademyRoles(invitation.role ?? "");
            // Covers an invitation made before the user became a platform
            // admin, or one for an email they signed up with later.
            await assertNotPlatformAdmin({ id: user.id });
            if (
              !(hasRole(invitation.role, STUDENT_ROLE) && invitation.teamId)
            ) {
              return;
            }
            // The invitation stores several teams as a comma-separated list.
            const teamIds = invitation.teamId.split(",");
            const [firstTeamId] = teamIds;
            if (
              teamIds.length > 1 ||
              (await isOnAnotherTeam(user.id, academy.id, firstTeamId))
            ) {
              throw badRequest(ONE_TEAM_PER_STUDENT_MESSAGE);
            }
          },
          // A student is on at most one team per academy; coaches may be on several.
          beforeAddTeamMember: async ({
            teamMember,
            organization: academy,
          }) => {
            const role = await findMemberRole(academy.id, teamMember.userId);
            if (!hasRole(role, STUDENT_ROLE)) {
              return;
            }
            if (
              await isOnAnotherTeam(
                teamMember.userId,
                academy.id,
                teamMember.teamId
              )
            ) {
              throw badRequest(ONE_TEAM_PER_STUDENT_MESSAGE);
            }
          },
          // Admin role changes belong to the platform owner. Making someone a
          // student who is already on several teams would break the one-team
          // rule.
          beforeUpdateMemberRole: async ({
            member,
            newRole,
            organization: academy,
          }) => {
            assertAcademyRoles(newRole);
            if (
              isAcademyAdmin(member.role) ||
              hasRole(newRole, ACADEMY_ADMIN_ROLE)
            ) {
              throw forbidden(PLATFORM_OWNER_ONLY_MESSAGE);
            }
            const becomesStudent =
              hasRole(newRole, STUDENT_ROLE) &&
              !hasRole(member.role, STUDENT_ROLE);
            if (!becomesStudent) {
              return;
            }
            const teamCount = await countTeamsInAcademy(
              member.userId,
              academy.id
            );
            if (teamCount > 1) {
              throw badRequest(ONE_TEAM_PER_STUDENT_MESSAGE);
            }
          },
          // Removing an admin from the academy is the platform owner's.
          beforeRemoveMember: ({ member }) => {
            if (isAcademyAdmin(member.role)) {
              throw forbidden(PLATFORM_OWNER_ONLY_MESSAGE);
            }
            return Promise.resolve();
          },
        },
      }),
      invitationPrivacy,
      // Must stay last: it sets cookies from the responses of the plugins above.
      tanstackStartCookies(),
    ],
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = Auth["$Infer"]["Session"];
