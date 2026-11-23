/**
 * The role model as enforced inside Better Auth (packages/auth/src/index.ts
 * and permissions.ts): academy admins never manage admins, coaches change
 * only their own teams' student rosters, and Better Auth's built-in `owner`
 * and `member` roles can't be created through any of its endpoints.
 *
 * Calls go through `auth.handler` as real HTTP requests with the user's
 * session cookie, the path clients use. (A before hook's error is thrown out
 * of `auth.api.*` rather than returned, so that path can't assert statuses.)
 */
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, db } from "../../services";
import {
  addMember,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";

const HTTP_OK = 200;
const HTTP_BAD_REQUEST = 400;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const DAY_MS = 24 * 60 * 60 * 1000;

let academy: TestAcademy;
let admin: TestUser;
let secondAdmin: TestUser;
let coach: TestUser;
let otherCoach: TestUser;
let student: TestUser;
let looseStudent: TestUser;
let otherTeamStudent: TestUser;
let outsider: TestUser;
let platformOwner: TestUser;
let teamA: string;
let teamB: string;
const extraUsers: TestUser[] = [];

const BASE_URL = "http://localhost:3001";

/** POST /api/auth<path> as `user`, through Better Auth's HTTP handler. */
const post = (path: string, user: TestUser, body: unknown) =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        cookie: user.cookie,
        origin: BASE_URL,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );

const newEmail = (label: string): string =>
  `${label}-${runId()}@test.hoops-genesis.local`;

const memberIdOf = async (user: TestUser): Promise<string> =>
  (
    await db.member.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: academy.id, userId: user.id },
      },
      select: { id: true },
    })
  ).id;

const roleOf = async (user: TestUser): Promise<string | null> =>
  (
    await db.member.findUnique({
      where: {
        organizationId_userId: { organizationId: academy.id, userId: user.id },
      },
      select: { role: true },
    })
  )?.role ?? null;

const invite = (user: TestUser, role: unknown, email = newEmail("invitee")) =>
  post("/organization/invite-member", user, {
    email,
    role,
    organizationId: academy.id,
  });

const updateRole = async (actor: TestUser, target: TestUser, role: unknown) =>
  post("/organization/update-member-role", actor, {
    memberId: await memberIdOf(target),
    role,
    organizationId: academy.id,
  });

const removeMember = async (actor: TestUser, target: TestUser) =>
  post("/organization/remove-member", actor, {
    memberIdOrEmail: await memberIdOf(target),
    organizationId: academy.id,
  });

const roster = (
  action: "add" | "remove",
  actor: TestUser,
  teamId: string,
  target: TestUser
) =>
  post(`/organization/${action}-team-member`, actor, {
    teamId,
    userId: target.id,
    organizationId: academy.id,
  });

const createInvitationRow = async (email: string, role: string) =>
  db.invitation.create({
    data: {
      id: randomUUID(),
      organizationId: academy.id,
      email,
      role,
      status: "pending",
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + DAY_MS),
      inviterId: platformOwner.id,
    },
  });

const rosterAudit = (teamId: string, action: string, actorId: string) =>
  db.auditLog.findMany({
    where: { entityType: "team", entityId: teamId, action, actorId },
  });

beforeAll(async () => {
  academy = await createTestAcademy();
  [
    admin,
    secondAdmin,
    coach,
    otherCoach,
    student,
    looseStudent,
    otherTeamStudent,
    outsider,
  ] = await Promise.all(
    [
      "ba-admin",
      "ba-admin2",
      "ba-coach",
      "ba-coach-b",
      "ba-student",
      "ba-loose",
      "ba-student-b",
      "ba-outsider",
    ].map((label) => createTestUser(label))
  );
  platformOwner = await createTestUser("ba-platform", {
    platformRole: "admin",
  });
  await Promise.all([
    addMember(academy, admin, "admin"),
    addMember(academy, secondAdmin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, otherCoach, "coach"),
    addMember(academy, student, "student"),
    addMember(academy, looseStudent, "student"),
    addMember(academy, otherTeamStudent, "student"),
  ]);
  teamA = await createTeam(academy, [coach, student]);
  teamB = await createTeam(academy, [otherCoach, otherTeamStudent]);
});

afterAll(async () => {
  await db.invitation.deleteMany({ where: { organizationId: academy.id } });
  await cleanup(
    [academy],
    [
      admin,
      secondAdmin,
      coach,
      otherCoach,
      student,
      looseStudent,
      otherTeamStudent,
      outsider,
      platformOwner,
      ...extraUsers,
    ]
  );
});

describe("academy admins never manage admins", () => {
  it("cannot invite an admin; Better Auth's owner and member roles are refused", async () => {
    expect((await invite(admin, "admin")).status).toBe(HTTP_FORBIDDEN);
    expect((await invite(admin, "coach,admin")).status).toBe(HTTP_FORBIDDEN);
    expect((await invite(admin, "owner")).status).toBe(HTTP_BAD_REQUEST);
    expect((await invite(admin, "member")).status).toBe(HTTP_BAD_REQUEST);
    expect((await invite(admin, ["coach", "owner"])).status).toBe(
      HTTP_BAD_REQUEST
    );
    expect((await invite(admin, "coach")).status).toBe(HTTP_OK);
    expect((await invite(admin, "student")).status).toBe(HTTP_OK);
  });

  it("cannot promote anyone to admin, demote an admin, or set Better Auth's roles", async () => {
    expect((await updateRole(admin, looseStudent, "admin")).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await updateRole(admin, secondAdmin, "coach")).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await updateRole(admin, admin, "admin,coach")).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await updateRole(admin, looseStudent, "owner")).status).toBe(
      HTTP_BAD_REQUEST
    );
    expect((await updateRole(admin, looseStudent, "member")).status).toBe(
      HTTP_BAD_REQUEST
    );
    expect(await roleOf(looseStudent)).toBe("student");
    expect(await roleOf(secondAdmin)).toBe("admin");
  });

  it("still changes roles between coach and student", async () => {
    const hybrid = await createTestUser("ba-hybrid");
    extraUsers.push(hybrid);
    await addMember(academy, hybrid, "student");
    expect((await updateRole(admin, hybrid, "coach,student")).status).toBe(
      HTTP_OK
    );
    expect(await roleOf(hybrid)).toBe("coach,student");
  });

  it("cannot remove an admin, but removes coaches and students", async () => {
    expect((await removeMember(admin, secondAdmin)).status).toBe(
      HTTP_FORBIDDEN
    );
    expect(await roleOf(secondAdmin)).toBe("admin");
    const leaving = await createTestUser("ba-leaving");
    extraUsers.push(leaving);
    await addMember(academy, leaving, "student");
    expect((await removeMember(admin, leaving)).status).toBe(HTTP_OK);
    expect(await roleOf(leaving)).toBeNull();
  });

  it("cannot resend or cancel the platform owner's admin invitation", async () => {
    const email = newEmail("ba-admin-invitee");
    const invitation = await createInvitationRow(email, "admin");
    const resend = await post("/organization/invite-member", admin, {
      email,
      role: "coach",
      resend: true,
      organizationId: academy.id,
    });
    expect(resend.status).toBe(HTTP_FORBIDDEN);
    const cancel = await post("/organization/cancel-invitation", admin, {
      invitationId: invitation.id,
    });
    expect(cancel.status).toBe(HTTP_FORBIDDEN);
    const after = await db.invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(after.status).toBe("pending");
    expect(after.expiresAt).toEqual(invitation.expiresAt);
  });
});

describe("Better Auth's owner role can't be created", () => {
  it("server-only addMember refuses owner and member", async () => {
    const user = await createTestUser("ba-added");
    extraUsers.push(user);
    const responses = await Promise.all(
      ["owner", "member"].map((role) =>
        auth.api.addMember({
          body: {
            userId: user.id,
            role: role as "coach",
            organizationId: academy.id,
          },
          asResponse: true,
        })
      )
    );
    expect(responses.map((response) => response.status)).toEqual([
      HTTP_BAD_REQUEST,
      HTTP_BAD_REQUEST,
    ]);
    expect(await roleOf(user)).toBeNull();
  });

  it("accepting an old invitation with the owner role is refused", async () => {
    const user = await createTestUser("ba-old-invite");
    extraUsers.push(user);
    const invitation = await createInvitationRow(user.email, "owner");
    const response = await post("/organization/accept-invitation", user, {
      invitationId: invitation.id,
    });
    expect(response.status).toBe(HTTP_BAD_REQUEST);
    expect(await roleOf(user)).toBeNull();
  });

  it("an admin invitation from the platform owner is accepted as admin", async () => {
    const user = await createTestUser("ba-new-admin");
    extraUsers.push(user);
    const invitation = await createInvitationRow(user.email, "admin");
    const response = await post("/organization/accept-invitation", user, {
      invitationId: invitation.id,
    });
    expect(response.status).toBe(HTTP_OK);
    expect(await roleOf(user)).toBe("admin");
  });

  it("Better Auth's own create and delete are closed, even to the platform owner", async () => {
    const create = await post("/organization/create", platformOwner, {
      name: "Nope",
      slug: `nope-${runId()}`,
      timezone: "Africa/Lagos",
      defaultCurrency: "NGN",
      latitude: 6.5,
      longitude: 3.4,
    });
    expect(create.status).toBe(HTTP_FORBIDDEN);
    const remove = await post("/organization/delete", admin, {
      organizationId: academy.id,
    });
    expect(remove.status).toBe(HTTP_NOT_FOUND);
  });
});

describe("coach rosters through Better Auth", () => {
  it("a coach adds and removes a student on a team they coach, audited", async () => {
    const added = await roster("add", coach, teamA, looseStudent);
    expect(added.status).toBe(HTTP_OK);
    expect(
      await db.teamMember.count({
        where: { teamId: teamA, userId: looseStudent.id },
      })
    ).toBe(1);
    const addRows = await rosterAudit(teamA, "team.member_add", coach.id);
    expect(addRows).toHaveLength(1);
    expect(addRows[0]).toMatchObject({ academyId: academy.id });
    expect(addRows[0]?.after).toMatchObject({
      teamId: teamA,
      userId: looseStudent.id,
    });

    const removed = await roster("remove", coach, teamA, looseStudent);
    expect(removed.status).toBe(HTTP_OK);
    expect(
      await db.teamMember.count({
        where: { teamId: teamA, userId: looseStudent.id },
      })
    ).toBe(0);
    const removeRows = await rosterAudit(teamA, "team.member_remove", coach.id);
    expect(removeRows).toHaveLength(1);
    expect(removeRows[0]?.before).toEqual({
      teamId: teamA,
      userId: looseStudent.id,
    });
  });

  it("not on another team, not for non-members, not for coaches or admins", async () => {
    expect((await roster("add", coach, teamB, looseStudent)).status).toBe(
      HTTP_FORBIDDEN
    );
    expect(
      (await roster("remove", coach, teamB, otherTeamStudent)).status
    ).toBe(HTTP_FORBIDDEN);
    expect((await roster("add", coach, teamA, outsider)).status).toBe(
      HTTP_BAD_REQUEST
    );
    expect((await roster("add", coach, teamA, otherCoach)).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await roster("add", coach, teamA, admin)).status).toBe(
      HTTP_FORBIDDEN
    );
    // Refused attempts leave no audit rows.
    expect(await rosterAudit(teamB, "team.member_add", coach.id)).toHaveLength(
      0
    );
  });

  it("keeps the one-team-per-student rule", async () => {
    expect((await roster("add", coach, teamA, otherTeamStudent)).status).toBe(
      HTTP_BAD_REQUEST
    );
    expect((await roster("add", admin, teamA, otherTeamStudent)).status).toBe(
      HTTP_BAD_REQUEST
    );
  });

  it("a coach cannot change roles or remove members from the academy", async () => {
    expect((await updateRole(coach, looseStudent, "coach")).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await removeMember(coach, looseStudent)).status).toBe(
      HTTP_FORBIDDEN
    );
    expect(await roleOf(looseStudent)).toBe("student");
  });

  it("a student cannot change rosters; an admin can on any team, audited", async () => {
    expect((await roster("add", student, teamA, looseStudent)).status).toBe(
      HTTP_FORBIDDEN
    );
    expect((await roster("add", admin, teamB, looseStudent)).status).toBe(
      HTTP_OK
    );
    expect(await rosterAudit(teamB, "team.member_add", admin.id)).toHaveLength(
      1
    );
    expect((await roster("remove", admin, teamB, looseStudent)).status).toBe(
      HTTP_OK
    );
  });
});

describe("platform admins are never academy members", () => {
  const setPlatformRole = (userId: string, role: string) =>
    db.user.update({ where: { id: userId }, data: { role } });

  it("an invitation for a platform admin's email is refused", async () => {
    const response = await invite(admin, "coach", platformOwner.email);
    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(
      await db.invitation.count({
        where: { organizationId: academy.id, email: platformOwner.email },
      })
    ).toBe(0);
  });

  it("accepting an invitation as a platform admin is refused, however it was made", async () => {
    const user = await createTestUser("ba-later-owner");
    extraUsers.push(user);
    // Invited while an ordinary user, then made a platform admin.
    expect((await invite(admin, "coach", user.email)).status).toBe(HTTP_OK);
    await setPlatformRole(user.id, "admin");
    const invitation = await db.invitation.findFirstOrThrow({
      where: { organizationId: academy.id, email: user.email },
    });
    const response = await post("/organization/accept-invitation", user, {
      invitationId: invitation.id,
    });
    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(await roleOf(user)).toBeNull();
  });

  it("server-side addMember refuses a platform admin", async () => {
    await expect(
      auth.api.addMember({
        body: {
          userId: platformOwner.id,
          role: "coach",
          organizationId: academy.id,
        },
      })
    ).rejects.toThrow();
    expect(await roleOf(platformOwner)).toBeNull();
  });

  it("making an academy member a platform admin is refused; memberships are kept", async () => {
    const member = await createTestUser("ba-member-to-owner");
    extraUsers.push(member);
    await addMember(academy, member, "coach");
    for (const [path, body] of [
      ["/admin/set-role", { userId: member.id, role: "admin" }],
      ["/admin/set-role", { userId: member.id, role: ["user", "admin"] }],
      ["/admin/update-user", { userId: member.id, data: { role: "admin" } }],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one call at a time
      const response = await post(path, platformOwner, body);
      expect({ path, status: response.status }).toEqual({
        path,
        status: HTTP_FORBIDDEN,
      });
    }
    const after = await db.user.findUniqueOrThrow({ where: { id: member.id } });
    expect(after.role).not.toContain("admin");
    expect(await roleOf(member)).toBe("coach");

    // Someone with no academy membership can be made a platform admin.
    const free = await createTestUser("ba-free-to-owner");
    extraUsers.push(free);
    const ok = await post("/admin/set-role", platformOwner, {
      userId: free.id,
      role: "admin",
    });
    expect(ok.status).toBe(HTTP_OK);
  });
});
