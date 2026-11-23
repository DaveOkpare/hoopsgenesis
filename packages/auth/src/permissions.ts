/**
 * Academy (organization) access control, shared by the server and the clients.
 *
 * Keep this file free of server-only imports so web and native clients can
 * import it directly.
 */
import { createAccessControl } from "better-auth/plugins/access";
import {
  adminAc,
  defaultStatements,
  memberAc,
  ownerAc,
} from "better-auth/plugins/organization/access";

export const statement = {
  ...defaultStatements,
  attendance: ["create", "read", "update"],
  fee: ["create", "read", "update"],
  record: ["create", "read", "verify"],
  event: ["create", "read", "update", "delete"],
} as const;

export const ac = createAccessControl(statement);

const allAcademyPermissions = {
  attendance: ["create", "read", "update"],
  fee: ["create", "read", "update"],
  record: ["create", "read", "verify"],
  event: ["create", "read", "update", "delete"],
} as const;

/** Everything in the academy, including deleting it and transferring ownership. */
export const owner = ac.newRole({
  ...ownerAc.statements,
  ...allAcademyPermissions,
});

/** Everything in the academy except deleting it or changing the owner. */
export const admin = ac.newRole({
  ...adminAc.statements,
  ...allAcademyPermissions,
});

/** Takes attendance, views fees, records and verifies records, manages events. */
export const coach = ac.newRole({
  ...memberAc.statements,
  attendance: ["create", "read", "update"],
  fee: ["read"],
  record: ["create", "read", "verify"],
  event: ["create", "read", "update", "delete"],
});

/** Views own attendance, fees and records; uploads academic records; views events. */
export const student = ac.newRole({
  ...memberAc.statements,
  attendance: ["read"],
  fee: ["read"],
  record: ["create", "read"],
  event: ["read"],
});

export const academyRoles = { owner, admin, coach, student } as const;

export type AcademyRole = keyof typeof academyRoles;
