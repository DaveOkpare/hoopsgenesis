/**
 * Who may become an academy member, and on which teams. Shared by the Better
 * Auth hooks in ./index.ts (invitations, addMember, addTeamMember) and by the
 * app's own membership writes (apps/web invitation-code redemption), so a
 * membership follows the same rules however it is made. Server-only.
 *
 * The checks return booleans; each caller throws its own error type
 * (Better Auth's APIError in the hooks, the app's ApiError in /api/v1).
 */
import { createHash } from "node:crypto";

import type { Database } from "@hoops-genesis/db";

import { ACADEMY_ROLE_NAMES } from "./permissions";

/** The admin plugin's role for the platform owner (`user.role`). */
export const PLATFORM_ADMIN_ROLE = "admin";
export const COACH_ROLE = "coach";
export const STUDENT_ROLE = "student";

export const ONE_TEAM_PER_STUDENT_MESSAGE =
  "A student can be on only one team per academy";
export const UNKNOWN_ROLE_MESSAGE = `Academy roles are ${ACADEMY_ROLE_NAMES.join(", ")}`;
export const PLATFORM_ADMIN_NOT_MEMBER_MESSAGE =
  "Platform admins can't be academy members";

/** A Prisma client or transaction: only the tables these rules read. */
export type RulesClient = Pick<Database, "user" | "teamMember">;

/** Member and user roles can hold several comma-separated roles. */
export const splitRoles = (
  roles: string | readonly string[] | null | undefined
): string[] => {
  const values: readonly string[] =
    typeof roles === "string" || roles === null || roles === undefined
      ? (roles ?? "").split(",")
      : roles.flatMap((role) => role.split(","));
  return values
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
};

export const hasRole = (
  roles: string | readonly string[] | null | undefined,
  role: string
): boolean => splitRoles(roles).includes(role);

const academyRoleNames = new Set<string>(ACADEMY_ROLE_NAMES);

/**
 * Only our academy roles (admin, coach, student), at least one. Better Auth
 * 1.7.12 accepts its built-in `owner` and `member` names even when `roles`
 * leaves them out, so every path that sets a role checks this.
 */
export const isValidAcademyRoleList = (
  roles: string | readonly string[]
): boolean => {
  const parsed = splitRoles(roles);
  return (
    parsed.length > 0 && parsed.every((role) => academyRoleNames.has(role))
  );
};

/** Platform admins act through /api/v1/admin/*, never as academy members. */
export const isPlatformAdminUser = async (
  client: RulesClient,
  where: { id?: string; email?: string }
): Promise<boolean> => {
  const user = where.id
    ? await client.user.findUnique({
        where: { id: where.id },
        select: { role: true },
      })
    : await client.user.findUnique({
        where: { email: (where.email ?? "").toLowerCase() },
        select: { role: true },
      });
  return hasRole(user?.role, PLATFORM_ADMIN_ROLE);
};

/** Is the user on any team of the academy other than `exceptTeamId`? */
export const isOnAnotherTeam = async (
  client: RulesClient,
  userId: string,
  academyId: string,
  exceptTeamId?: string
): Promise<boolean> => {
  const otherTeam = await client.teamMember.findFirst({
    where: {
      userId,
      team: { organizationId: academyId },
      ...(exceptTeamId ? { teamId: { not: exceptTeamId } } : {}),
    },
    select: { id: true },
  });
  return otherTeam !== null;
};

/**
 * `teamMember.membershipKey` as Better Auth 1.7.12 computes it
 * (organization adapter `computeTeamMembershipKey`): base64url, no padding,
 * of SHA-256 over `JSON.stringify([teamId, userId])`. Rows written outside
 * Better Auth must carry it, or Better Auth could add the same pair twice.
 */
export const teamMembershipKey = (teamId: string, userId: string): string =>
  createHash("sha256")
    .update(JSON.stringify([teamId, userId]))
    .digest("base64url");
