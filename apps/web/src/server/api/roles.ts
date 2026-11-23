/**
 * Academy roles and permissions, as pure functions (no database, no session).
 * member.role and user.role can both hold several comma-separated roles.
 *
 * Inside an academy the roles are admin, coach and student. The platform
 * owner (`user.role = 'admin'`) is not an academy member and never appears
 * here as a role; see access.ts `requirePlatformAdmin`.
 */
import { academyRoles, type statement } from "@hoops-genesis/auth/permissions";

type Statement = typeof statement;

/** e.g. `{ attendance: ["create"] }`. Several entries must all be allowed. */
export type AcademyPermissions = {
  [Resource in keyof Statement]?: readonly Statement[Resource][number][];
};

export type AcademyRoleName = keyof typeof academyRoles;

export interface AcademyMember {
  academyId: string;
  /** member.id */
  id: string;
  /** Academy admin: manages the whole academy. Use for every write check. */
  isAdmin: boolean;
  isCoach: boolean;
  isStudent: boolean;
  /** member.role split on commas, e.g. ["coach", "student"]. */
  roles: readonly string[];
  /**
   * Reads every row of the academy (scope "all"). True for academy admins.
   * Kept apart from `isAdmin` so a read-only viewer (the platform owner's
   * academy views) can see everything without passing any write check:
   * build it with `toAcademyViewer`.
   */
  seesWholeAcademy: boolean;
  userId: string;
}

/** Splits a comma-separated role value (member.role or user.role). */
export const parseRoles = (value: string | null | undefined): string[] =>
  (value ?? "")
    .split(",")
    .map((role) => role.trim())
    .filter((role) => role.length > 0);

const isAcademyRoleName = (role: string): role is AcademyRoleName =>
  Object.hasOwn(academyRoles, role);

/**
 * Same rule as Better Auth's `hasPermission` (organization plugin): allowed
 * if any one of the roles grants every requested action. Checked in memory
 * against the roles in packages/auth/src/permissions.ts, because the member
 * row is already loaded (dynamic access control is off, so Better Auth would
 * read the same static roles).
 */
export const hasAcademyPermission = (
  roles: readonly string[],
  permissions: AcademyPermissions
): boolean =>
  roles.some(
    (role) =>
      isAcademyRoleName(role) &&
      academyRoles[role].authorize(
        permissions as Parameters<
          (typeof academyRoles)[AcademyRoleName]["authorize"]
        >[0]
      ).success
  );

export const toAcademyMember = (row: {
  id: string;
  userId: string;
  organizationId: string;
  role: string;
}): AcademyMember => {
  const roles = parseRoles(row.role);
  const isAdmin = roles.includes("admin");
  return {
    id: row.id,
    userId: row.userId,
    academyId: row.organizationId,
    roles,
    isAdmin,
    isCoach: roles.includes("coach"),
    isStudent: roles.includes("student"),
    seesWholeAcademy: isAdmin,
  };
};

/**
 * A read-only stand-in for someone who is not a member but may read the
 * whole academy (the platform owner). No roles, so `hasAcademyPermission`
 * and every `isAdmin` / `isCoach` check refuse writes; `seesWholeAcademy`
 * makes the scope helpers return "all". `id` is empty: there is no member row.
 */
export const toAcademyViewer = (
  academyId: string,
  userId: string
): AcademyMember => ({
  id: "",
  userId,
  academyId,
  roles: [],
  isAdmin: false,
  isCoach: false,
  isStudent: false,
  seesWholeAcademy: true,
});
