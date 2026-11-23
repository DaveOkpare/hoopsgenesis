/**
 * Academy (organization) access control, shared by the server and the clients.
 *
 * Keep this file free of server-only imports so web and native clients can
 * import it directly.
 *
 * Roles: the platform owner is `user.role = 'admin'` (admin plugin) and is
 * never an academy member. Inside an academy, `member.role` is `admin`,
 * `coach` or `student`. Better Auth's built-in `owner` and `member` roles are
 * not used; hooks in ./index.ts refuse them.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  attendance: ["create", "read", "update", "verify", "void"],
  fee: ["create", "read", "void"],
  audit: ["read"],
  record: ["create", "read", "verify"],
  event: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

const allAcademyPermissions = {
  attendance: [...statement.attendance],
  fee: [...statement.fee],
  audit: [...statement.audit],
  record: [...statement.record],
  event: [...statement.event],
};

/**
 * Runs one academy: details, teams, coaches and students, attendance, fees,
 * records, calendar, QR. Has no `organization:delete`, so no academy member
 * can delete the academy. Hooks in ./index.ts stop admins from inviting,
 * promoting, demoting or removing another admin (only the platform owner
 * does that, through /api/v1/admin/*).
 */
export const admin = ac.newRole({
  ...adminAc.statements,
  ...allAcademyPermissions,
});

/**
 * Takes attendance, views fees, records and verifies records, manages events
 * and the rosters of their own teams.
 *
 * `member: ["update", "delete"]` is here only because Better Auth 1.7.12
 * checks those (not `team:update`) on addTeamMember and removeTeamMember.
 * The same permissions also open updateMemberRole, removeMember and
 * listUserTeams for another user; the before hook in ./index.ts refuses the
 * first two for anyone who is not an academy admin, and limits roster
 * changes to students on teams the coach is on.
 */
export const coach = ac.newRole({
  // Rename their own teams; the hook limits it to teams the coach is on.
  team: ["update"],
  member: ["update", "delete"],
  attendance: ["create", "read", "update", "verify"],
  fee: ["read"],
  record: ["create", "read", "verify"],
  event: ["create", "read", "update", "delete"],
});

/** Views own attendance, fees and records; uploads academic records; views events. */
export const student = ac.newRole({
  attendance: ["read"],
  fee: ["read"],
  record: ["create", "read"],
  event: ["read"],
});

export const academyRoles = { admin, coach, student } as const;

export type AcademyRole = keyof typeof academyRoles;

/** The only values `member.role` may hold (comma-separated for several). */
export const ACADEMY_ROLE_NAMES = Object.keys(academyRoles) as AcademyRole[];

/** The academy role only the platform owner may grant or take away. */
export const ACADEMY_ADMIN_ROLE = "admin" satisfies AcademyRole;
