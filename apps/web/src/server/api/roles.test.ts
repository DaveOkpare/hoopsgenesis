import { ac, academyRoles, statement } from "@hoops-genesis/auth/permissions";
import { hasPermission } from "better-auth/plugins";
import { describe, expect, it } from "vitest";

import {
  type AcademyPermissions,
  hasAcademyPermission,
  parseRoles,
  toAcademyMember,
  toAcademyViewer,
} from "./roles";

// "owner" and "member" are Better Auth's built-in names; they grant nothing.
const ROLE_VALUES = [
  "owner",
  "admin",
  "coach",
  "student",
  "coach,student",
  "student,admin",
  "member",
  "",
];

/** Every single resource:action pair in the statement. */
const allPermissions = (): AcademyPermissions[] =>
  Object.entries(statement).flatMap(([resource, actions]) =>
    actions.map((action) => ({ [resource]: [action] }) as AcademyPermissions)
  );

describe("parseRoles", () => {
  it("splits comma-separated roles and trims them", () => {
    expect(parseRoles("coach, student")).toEqual(["coach", "student"]);
    expect(parseRoles(null)).toEqual([]);
    expect(parseRoles("")).toEqual([]);
  });
});

describe("toAcademyMember", () => {
  it("sets role flags for combined roles", () => {
    const member = toAcademyMember({
      id: "m",
      userId: "u",
      organizationId: "o",
      role: "coach,student",
    });
    expect(member).toMatchObject({
      isAdmin: false,
      isCoach: true,
      isStudent: true,
      seesWholeAcademy: false,
    });
    expect(
      toAcademyMember({
        id: "m",
        userId: "u",
        organizationId: "o",
        role: "admin",
      })
    ).toMatchObject({ isAdmin: true, seesWholeAcademy: true });
  });

  it("gives Better Auth's owner role no academy flags", () => {
    expect(
      toAcademyMember({
        id: "m",
        userId: "u",
        organizationId: "o",
        role: "owner",
      })
    ).toMatchObject({
      isAdmin: false,
      isCoach: false,
      isStudent: false,
      seesWholeAcademy: false,
    });
  });

  it("builds a read-only viewer that sees everything and may change nothing", () => {
    const viewer = toAcademyViewer("o", "u");
    expect(viewer).toMatchObject({ isAdmin: false, seesWholeAcademy: true });
    expect(
      allPermissions().some((permissions) =>
        hasAcademyPermission(viewer.roles, permissions)
      )
    ).toBe(false);
  });
});

describe("hasAcademyPermission", () => {
  it("matches the role table", () => {
    expect(hasAcademyPermission(["owner"], { audit: ["read"] })).toBe(false);
    expect(hasAcademyPermission(["admin"], { fee: ["void"] })).toBe(true);
    expect(hasAcademyPermission(["admin"], { organization: ["update"] })).toBe(
      true
    );
    // Only the platform owner deletes academies, outside access control.
    expect(hasAcademyPermission(["admin"], { organization: ["delete"] })).toBe(
      false
    );
    // Rosters through Better Auth need these; hooks limit them for coaches.
    expect(
      hasAcademyPermission(["coach"], { member: ["update", "delete"] })
    ).toBe(true);
    expect(hasAcademyPermission(["coach"], { invitation: ["create"] })).toBe(
      false
    );
    expect(hasAcademyPermission(["coach"], { audit: ["read"] })).toBe(false);
    expect(
      hasAcademyPermission(["coach"], { attendance: ["create", "verify"] })
    ).toBe(true);
    expect(hasAcademyPermission(["coach"], { fee: ["create"] })).toBe(false);
    expect(hasAcademyPermission(["student"], { record: ["create"] })).toBe(
      true
    );
    expect(hasAcademyPermission(["student"], { attendance: ["create"] })).toBe(
      false
    );
    expect(
      hasAcademyPermission(["student", "admin"], { audit: ["read"] })
    ).toBe(true);
    expect(hasAcademyPermission(["unknown"], { event: ["read"] })).toBe(false);
  });

  it("agrees with Better Auth's hasPermission for every role and action", async () => {
    const options = { ac, roles: academyRoles, creatorRole: "admin" };
    const cases = ROLE_VALUES.flatMap((role) =>
      allPermissions().map((permissions) => ({ role, permissions }))
    );
    const expected = await Promise.all(
      cases.map(({ role, permissions }) =>
        hasPermission(
          // Dynamic access control is off, so Better Auth never reads ctx.
          {
            role,
            options,
            permissions: permissions as Record<string, string[]>,
            organizationId: "parity-test",
          },
          {} as never
        )
      )
    );
    const actual = cases.map(({ role, permissions }) =>
      hasAcademyPermission(parseRoles(role), permissions)
    );
    expect(actual).toEqual(expected);
    // Sanity: the table is not all true or all false.
    expect(new Set(actual).size).toBe(2);
  });
});
