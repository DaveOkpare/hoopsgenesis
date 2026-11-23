/**
 * Role model and escalation attempts through Better Auth (API endpoints,
 * "Access by role" and "How it's enforced"; schema doc, Rules: Membership):
 * inside an academy the roles are admin, coach and student; only the
 * platform owner appoints or removes admins; Better Auth's owner and member
 * roles are never accepted; coaches change rosters only on their own teams
 * and only for students, and each roster change is audited.
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  authCall,
  type Body,
  call,
  type Reply,
  signUp,
  type User,
  uniqueSuffix,
} from "./helpers/http";
import { db, seedMember, setPlatformRole } from "./helpers/seed";
import {
  auditRows,
  buildWorld,
  createEvent,
  createRecord,
  expectStatus,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;
let owner: User;

const memberRole = async (userId: string): Promise<string | null> => {
  const row = await db().member.findUnique({
    where: {
      organizationId_userId: { organizationId: w.academy.id, userId },
    },
    select: { role: true },
  });
  return row?.role ?? null;
};

const memberId = async (userId: string): Promise<string> =>
  (
    await db().member.findUniqueOrThrow({
      where: {
        organizationId_userId: { organizationId: w.academy.id, userId },
      },
      select: { id: true },
    })
  ).id;

const platformRole = async (userId: string): Promise<string | null> =>
  (
    await db().user.findUniqueOrThrow({
      where: { id: userId },
      select: { role: true },
    })
  ).role;

const refused = (reply: Reply): void => {
  expect(reply.status, reply.text).toBeGreaterThanOrEqual(400);
  expect(reply.status, reply.text).toBeLessThan(500);
};

const newEmail = (): string =>
  `e2e-esc-${uniqueSuffix()}@test.hoops-genesis.local`;

const invite = (
  by: User,
  role: unknown,
  email = newEmail(),
  extra: Record<string, unknown> = {}
): Promise<Reply> =>
  authCall(
    "/organization/invite-member",
    { email, role, organizationId: w.academy.id, ...extra },
    by
  );

beforeAll(async () => {
  w = await buildWorld();
  owner = await signUp("owner");
  await setPlatformRole(owner.id, "admin");
});

describe("nobody inside an academy can make an admin", () => {
  it.each([["admin"], [" admin"], ["coach,admin"], [["coach", "admin"]]])(
    "an academy admin inviting role %j -> 403",
    async (role) => {
      const reply = await invite(w.admin, role);
      expect(reply.status, reply.text).toBe(403);
    }
  );

  it.each([["owner"], ["member"], ["Admin"], ["parent"], [""]])(
    "an academy admin inviting Better Auth's or an unknown role %j -> 400",
    async (role) => {
      const reply = await invite(w.admin, role);
      refused(reply);
      expect(reply.status).not.toBe(200);
    }
  );

  it("an academy admin may invite coaches and students (control)", async () => {
    expect((await invite(w.admin, "coach")).status).toBe(200);
    expect((await invite(w.admin, "student")).status).toBe(200);
  });

  it("a coach or student cannot invite anyone", async () => {
    for (const user of [w.coach, w.student]) {
      for (const role of ["student", "coach", "admin"]) {
        const reply = await invite(user, role);
        expect(reply.status, `${user.label} ${role}`).toBe(403);
      }
    }
  });

  it("resending a pending admin invitation (made by the owner) -> 403", async () => {
    const email = newEmail();
    const appoint = await call(
      "POST",
      `/api/v1/admin/academies/${w.academy.id}/admins`,
      { user: owner, body: { email } }
    );
    const { invitation } = expectStatus(appoint, 201).data;
    for (const role of ["admin", "coach"]) {
      const resend = await invite(w.admin, role, email, { resend: true });
      expect(resend.status, `${role}: ${resend.text}`).toBeGreaterThanOrEqual(
        400
      );
    }
    const cancel = await authCall(
      "/organization/cancel-invitation",
      { invitationId: invitation.id },
      w.admin
    );
    expect(cancel.status, cancel.text).toBe(403);
    const row = await db().invitation.findUniqueOrThrow({
      where: { id: invitation.id },
    });
    expect(row.status).toBe("pending");
    expect(row.role).toBe("admin");
  });

  it("update-member-role to admin or owner is refused, for the admin and the coach", async () => {
    const coachMemberId = await memberId(w.coach.id);
    const attempts: [User, unknown][] = [
      [w.admin, "admin"],
      [w.admin, ["coach", "admin"]],
      [w.admin, "owner"],
      [w.admin, "member"],
      [w.coach, "admin"],
      [w.coach, "coach,admin"],
    ];
    for (const [by, role] of attempts) {
      const reply = await authCall(
        "/organization/update-member-role",
        { memberId: coachMemberId, role, organizationId: w.academy.id },
        by
      );
      refused(reply);
    }
    expect(await memberRole(w.coach.id)).toBe("coach");
  });

  it("a coach cannot promote themself, a student cannot either", async () => {
    for (const user of [w.coach, w.student]) {
      const reply = await authCall(
        "/organization/update-member-role",
        {
          memberId: await memberId(user.id),
          role: "admin",
          organizationId: w.academy.id,
        },
        user
      );
      refused(reply);
    }
    expect(await memberRole(w.coach.id)).toBe("coach");
    expect(await memberRole(w.student.id)).toBe("student");
  });

  it("an academy admin cannot demote or remove another admin", async () => {
    const second = await signUp("admin2");
    await seedMember(w.academy.id, second.id, "admin");
    const secondId = await memberId(second.id);
    const demote = await authCall(
      "/organization/update-member-role",
      { memberId: secondId, role: "coach", organizationId: w.academy.id },
      w.admin
    );
    expect(demote.status, demote.text).toBe(403);
    const remove = await authCall(
      "/organization/remove-member",
      { memberIdOrEmail: secondId, organizationId: w.academy.id },
      w.admin
    );
    expect(remove.status, remove.text).toBe(403);
    expect(await memberRole(second.id)).toBe("admin");
  });

  it("an academy admin changes coach <-> student and removes students (control)", async () => {
    const person = await signUp("switcher");
    await seedMember(w.academy.id, person.id, "student");
    const id = await memberId(person.id);
    const toCoach = await authCall(
      "/organization/update-member-role",
      { memberId: id, role: "coach", organizationId: w.academy.id },
      w.admin
    );
    expect(toCoach.status, toCoach.text).toBe(200);
    expect(await memberRole(person.id)).toBe("coach");
    const remove = await authCall(
      "/organization/remove-member",
      { memberIdOrEmail: id, organizationId: w.academy.id },
      w.admin
    );
    expect(remove.status, remove.text).toBe(200);
    expect(await memberRole(person.id)).toBeNull();
  });

  it("a coach cannot change roles or remove members at all", async () => {
    const id = await memberId(w.student2.id);
    const role = await authCall(
      "/organization/update-member-role",
      { memberId: id, role: "coach", organizationId: w.academy.id },
      w.coach
    );
    expect(role.status, role.text).toBe(403);
    const remove = await authCall(
      "/organization/remove-member",
      { memberIdOrEmail: id, organizationId: w.academy.id },
      w.coach
    );
    expect(remove.status, remove.text).toBe(403);
    expect(await memberRole(w.student2.id)).toBe("student");
  });

  it("nobody accepts an invitation addressed to someone else", async () => {
    const email = newEmail();
    const sent = await invite(w.admin, "coach", email);
    const invitationId = expectStatus(sent, 200).id;
    for (const user of [w.outsider, w.student]) {
      const reply = await authCall(
        "/organization/accept-invitation",
        { invitationId },
        user
      );
      refused(reply);
    }
    expect(await memberRole(w.outsider.id)).toBeNull();
    expect(await memberRole(w.student.id)).toBe("student");
  });

  it("an old invitation with Better Auth's owner role cannot be accepted", async () => {
    const email = newEmail();
    const invitee = await signUp("legacy", email);
    const invitation = await db().invitation.create({
      data: {
        id: `e2e-${uniqueSuffix()}`,
        organizationId: w.academy.id,
        email,
        role: "owner",
        status: "pending",
        expiresAt: new Date(Date.now() + 86_400_000),
        inviterId: w.admin.id,
        createdAt: new Date(),
      },
    });
    const reply = await authCall(
      "/organization/accept-invitation",
      { invitationId: invitation.id },
      invitee
    );
    refused(reply);
    expect(await memberRole(invitee.id)).toBeNull();
  });

  it("leave and rejoin by invite: the role is what the new invite says", async () => {
    const person = await signUp("rejoiner");
    await seedMember(w.academy.id, person.id, "coach");
    const left = await authCall(
      "/organization/leave",
      { organizationId: w.academy.id },
      person
    );
    expect(left.status, left.text).toBe(200);
    expect(await memberRole(person.id)).toBeNull();
    const sent = await invite(w.admin, "student", person.email);
    const accepted = await authCall(
      "/organization/accept-invitation",
      { invitationId: expectStatus(sent, 200).id },
      person
    );
    expect(accepted.status, accepted.text).toBe(200);
    expect(await memberRole(person.id)).toBe("student");
  });

  it("Better Auth's own create and delete are closed to everyone", async () => {
    for (const user of [w.admin, w.coach, owner]) {
      const slug = `e2e-ba-${uniqueSuffix()}`;
      const created = await authCall(
        "/organization/create",
        {
          name: slug,
          slug,
          timezone: "Africa/Lagos",
          defaultCurrency: "NGN",
          latitude: 6.5,
          longitude: 3.3,
        },
        user
      );
      refused(created);
      const row = await db().organization.findFirst({ where: { slug } });
      expect(row, `${user.label} created ${slug}`).toBeNull();
      const deleted = await authCall(
        "/organization/delete",
        { organizationId: w.academy.id },
        user
      );
      refused(deleted);
    }
    expect(
      await db().organization.findUnique({ where: { id: w.academy.id } })
    ).not.toBeNull();
  });

  it("the server-only add-member has no HTTP route", async () => {
    const reply = await authCall(
      "/organization/add-member",
      { userId: w.outsider.id, role: "admin", organizationId: w.academy.id },
      w.admin
    );
    refused(reply);
    expect(await memberRole(w.outsider.id)).toBeNull();
  });

  it("academy members cannot reach the platform role (admin plugin, update-user)", async () => {
    for (const user of [w.admin, w.coach]) {
      const setRole = await authCall(
        "/admin/set-role",
        { userId: user.id, role: "admin" },
        user
      );
      refused(setRole);
      const adminUpdate = await authCall(
        "/admin/update-user",
        { userId: user.id, data: { role: "admin" } },
        user
      );
      refused(adminUpdate);
      await authCall("/update-user", { role: "admin" }, user);
      expect(await platformRole(user.id)).toBe("user");
    }
  });

  it("the QR nonce cannot be set through organization.update", async () => {
    const before = await db().organization.findUniqueOrThrow({
      where: { id: w.academy.id },
      select: { qrNonce: true },
    });
    await authCall(
      "/organization/update",
      { organizationId: w.academy.id, data: { qrNonce: "chosen-by-admin" } },
      w.admin
    );
    const after = await db().organization.findUniqueOrThrow({
      where: { id: w.academy.id },
      select: { qrNonce: true },
    });
    expect(after.qrNonce).toBe(before.qrNonce);
  });

  // Was KNOWN DEFECT D5 (fixed in round 3) (also in platform-owner.e2e.test.ts): Better Auth's
  // invite + accept makes a platform admin an academy member.
  it("FIXED D5: a platform admin cannot be added as a member through Better Auth (invite + accept)", async () => {
    const otherOwner = await signUp("owner3");
    await setPlatformRole(otherOwner.id, "admin");
    const sent = await invite(w.admin, "coach", otherOwner.email);
    expect(sent.status, sent.text).toBe(403);
    expect(await memberRole(otherOwner.id)).toBeNull();
  });

  it("FIXED D5: a coach invited first, then made platform admin, cannot accept", async () => {
    const person = await signUp("late-owner");
    const sent = await invite(w.admin, "coach", person.email);
    const invitationId = expectStatus(sent, 200).id;
    await setPlatformRole(person.id, "admin");
    const accepted = await authCall(
      "/organization/accept-invitation",
      { invitationId },
      person
    );
    expect(accepted.status, accepted.text).toBe(403);
    expect(await memberRole(person.id)).toBeNull();
  });

  it("FIXED D5: admin.setRole / admin.updateUser refuse platform admin for an academy member", async () => {
    for (const body of [
      { path: "/admin/set-role", data: { userId: w.coach2.id, role: "admin" } },
      {
        path: "/admin/update-user",
        data: { userId: w.coach2.id, data: { role: "admin" } },
      },
    ]) {
      const reply = await authCall(body.path, body.data, owner);
      expect(reply.status, `${body.path}: ${reply.text}`).toBe(403);
    }
    expect(await platformRole(w.coach2.id)).toBe("user");
    // Control: the owner may make a non-member a platform admin.
    const free = await signUp("future-owner");
    const ok = await authCall(
      "/admin/set-role",
      { userId: free.id, role: "admin" },
      owner
    );
    expect(ok.status, ok.text).toBe(200);
    expect(await platformRole(free.id)).toBe("admin");
  });
});

describe("coach rosters through Better Auth (CO-10)", () => {
  const roster = (
    path: "add-team-member" | "remove-team-member",
    by: User,
    teamId: string,
    userId: string
  ) =>
    authCall(
      `/organization/${path}`,
      { teamId, userId, organizationId: w.academy.id },
      by
    );

  const onTeam = async (teamId: string, userId: string): Promise<boolean> =>
    (await db().teamMember.findFirst({ where: { teamId, userId } })) !== null;

  it("a coach adds an unplaced student to their team, audited as team.member_add", async () => {
    const reply = await roster(
      "add-team-member",
      w.coach,
      w.teamA,
      w.studentFree.id
    );
    expect(reply.status, reply.text).toBe(200);
    expect(await onTeam(w.teamA, w.studentFree.id)).toBe(true);
    const audit = await auditRows(w.academy, w.admin, {
      action: "team.member_add",
      entityId: w.teamA,
    });
    expect(audit[0]?.actorId).toBe(w.coach.id);
    // The coach now sees the student's rows (scope follows the roster).
    const records = await call(
      "GET",
      w.academy.path(`/students/${w.studentFree.id}/records`),
      { user: w.coach }
    );
    expect(records.status).toBe(200);
  });

  it("a coach removes a student from their team, audited as team.member_remove", async () => {
    const reply = await roster(
      "remove-team-member",
      w.coach,
      w.teamA,
      w.studentFree.id
    );
    expect(reply.status, reply.text).toBe(200);
    expect(await onTeam(w.teamA, w.studentFree.id)).toBe(false);
    const audit = await auditRows(w.academy, w.admin, {
      action: "team.member_remove",
      entityId: w.teamA,
    });
    expect(audit[0]?.actorId).toBe(w.coach.id);
  });

  it("a coach cannot change another team's roster", async () => {
    const add = await roster(
      "add-team-member",
      w.coach,
      w.teamB,
      w.studentFree.id
    );
    expect(add.status, add.text).toBe(403);
    const remove = await roster(
      "remove-team-member",
      w.coach,
      w.teamB,
      w.studentB.id
    );
    expect(remove.status, remove.text).toBe(403);
    expect(await onTeam(w.teamB, w.studentB.id)).toBe(true);
    expect(await onTeam(w.teamB, w.studentFree.id)).toBe(false);
  });

  it("a coach adds or removes only students, never coaches or admins", async () => {
    for (const target of [w.coachB, w.admin]) {
      const add = await roster("add-team-member", w.coach, w.teamA, target.id);
      expect(add.status, `${target.label}: ${add.text}`).toBe(403);
    }
    const removeCoach = await roster(
      "remove-team-member",
      w.coach,
      w.teamA,
      w.coach2.id
    );
    expect(removeCoach.status, removeCoach.text).toBe(403);
    expect(await onTeam(w.teamA, w.coach2.id)).toBe(true);
  });

  it("a coach cannot add someone outside the academy", async () => {
    const reply = await roster(
      "add-team-member",
      w.coach,
      w.teamA,
      w.other.student.id
    );
    refused(reply);
    expect(await onTeam(w.teamA, w.other.student.id)).toBe(false);
  });

  it("a student on another team cannot be added (one team per student)", async () => {
    const reply = await roster(
      "add-team-member",
      w.coach,
      w.teamA,
      w.studentB.id
    );
    refused(reply);
    expect(await onTeam(w.teamA, w.studentB.id)).toBe(false);
  });

  it("a coach cannot use another academy's team through their own academy id", async () => {
    const reply = await roster(
      "add-team-member",
      w.coach,
      w.other.teamX,
      w.studentFree.id
    );
    refused(reply);
    expect(await onTeam(w.other.teamX, w.studentFree.id)).toBe(false);
  });

  it("a student cannot change rosters", async () => {
    const reply = await roster(
      "add-team-member",
      w.student,
      w.teamA,
      w.studentFree.id
    );
    expect(reply.status, reply.text).toBe(403);
  });

  it("a coach renames only their own team; cannot create or delete teams", async () => {
    const own = await authCall(
      "/organization/update-team",
      {
        teamId: w.teamA,
        data: {
          name: `renamed-${uniqueSuffix()}`,
          organizationId: w.academy.id,
        },
      },
      w.coach
    );
    expect(own.status, own.text).toBe(200);
    const other = await authCall(
      "/organization/update-team",
      {
        teamId: w.teamB,
        data: { name: "hijacked", organizationId: w.academy.id },
      },
      w.coach
    );
    expect(other.status, other.text).toBe(403);
    const create = await authCall(
      "/organization/create-team",
      { name: "coach team", organizationId: w.academy.id },
      w.coach
    );
    refused(create);
    const remove = await authCall(
      "/organization/remove-team",
      { teamId: w.teamB, organizationId: w.academy.id },
      w.coach
    );
    refused(remove);
    expect(
      await db().team.findUnique({ where: { id: w.teamB } })
    ).not.toBeNull();
  });

  it("an academy admin manages any team's roster (control)", async () => {
    const add = await roster(
      "add-team-member",
      w.admin,
      w.teamB,
      w.studentFree.id
    );
    expect(add.status, add.text).toBe(200);
    const remove = await roster(
      "remove-team-member",
      w.admin,
      w.teamB,
      w.studentFree.id
    );
    expect(remove.status, remove.text).toBe(200);
  });
});

describe("behaviour changes from the role-model work", () => {
  it("any coach of the team edits and deletes the team's events, not only the creator", async () => {
    const event = await createEvent(w.academy, w.coach, { teamId: w.teamA });
    const patch = await call("PATCH", w.academy.path(`/events/${event.id}`), {
      user: w.coach2,
      body: { title: "Edited by coach2" },
    });
    expect(expectStatus(patch, 200).data.title).toBe("Edited by coach2");
    const otherTeam = await call(
      "PATCH",
      w.academy.path(`/events/${event.id}`),
      { user: w.coachB, body: { title: "nope" } }
    );
    expect(otherTeam.status).toBe(404);
    const remove = await call("DELETE", w.academy.path(`/events/${event.id}`), {
      user: w.coach2,
    });
    expect(remove.status).toBe(204);
  });

  it("an academy admin deletes but cannot edit a pending record", async () => {
    const own = await createRecord(
      w.academy,
      w.admin,
      w.student.id,
      "athletic"
    );
    const edit = await call("PATCH", w.academy.path(`/records/${own.id}`), {
      user: w.admin,
      body: { recordedOn: todayIn(w.academy) },
    });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe("admin_delete_only");
    const students = await createRecord(
      w.academy,
      w.student,
      w.student.id,
      "academic"
    );
    const remove = await call(
      "DELETE",
      w.academy.path(`/records/${students.id}`),
      { user: w.admin }
    );
    expect(remove.status).toBe(204);
  });

  it("member rows hold only admin, coach and student in a new world", async () => {
    const rows = await db().member.findMany({
      where: { organizationId: w.academy.id },
      select: { role: true },
    });
    const roles = new Set(rows.flatMap((row: Body) => row.role.split(",")));
    for (const role of roles) {
      expect(["admin", "coach", "student"]).toContain(role);
    }
  });
});
