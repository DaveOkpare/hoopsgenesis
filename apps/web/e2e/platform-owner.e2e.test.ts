/**
 * The platform owner (`user.role = 'admin'`) and /api/v1/admin/* (API
 * endpoints, "Access by role": Academies, people and teams; schema doc,
 * Rules: Membership). The owner creates and deletes academies and appoints
 * academy admins, is never a member, and is a non-member (404) on academy
 * routes.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { ACADEMY_LOCATION } from "./helpers/clock";
import {
  authCall,
  authGet,
  type Body,
  call,
  isErrorEnvelope,
  signUp,
  type User,
  uniqueSuffix,
} from "./helpers/http";
import { db, setPlatformRole } from "./helpers/seed";
import {
  buildWorld,
  createOpenEvent,
  expectStatus,
  recordFee,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;
let owner: User;

const academyBody = (firstAdmin: Record<string, string>) => {
  const slug = `e2e-owned-${uniqueSuffix()}`;
  return {
    name: slug,
    slug,
    timezone: "Africa/Lagos",
    defaultCurrency: "NGN",
    ...ACADEMY_LOCATION,
    firstAdmin,
  };
};

const createAcademy = async (firstAdmin: Record<string, string>) =>
  expectStatus(
    await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: academyBody(firstAdmin),
    }),
    201
  ).data;

beforeAll(async () => {
  w = await buildWorld();
  owner = await signUp("owner");
  await setPlatformRole(owner.id, "admin");
});

describe("only the platform owner reaches /api/v1/admin/*", () => {
  const routes = (academyId: string): [string, string, unknown?][] => [
    ["GET", "/api/v1/admin/academies"],
    ["POST", "/api/v1/admin/academies", academyBody({ userId: w.coach.id })],
    ["DELETE", `/api/v1/admin/academies/${academyId}`],
    [
      "POST",
      `/api/v1/admin/academies/${academyId}/admins`,
      { userId: w.coach.id },
    ],
    ["DELETE", `/api/v1/admin/academies/${academyId}/admins/${w.admin.id}`],
    [
      "DELETE",
      `/api/v1/admin/academies/${academyId}/admin-invitations/${randomUUID()}`,
    ],
    ["GET", "/api/v1/admin/audit-log"],
  ];

  it("no session -> 401", async () => {
    for (const [method, path, body] of routes(w.academy.id)) {
      const reply = await call(method, path, { body });
      expect(reply.status, `${method} ${path}`).toBe(401);
      expect(isErrorEnvelope(reply.body)).toBe(true);
    }
  });

  it("an academy admin, coach, student or outsider -> 403", async () => {
    for (const user of [w.admin, w.coach, w.student, w.outsider]) {
      for (const [method, path, body] of routes(w.academy.id)) {
        const reply = await call(method, path, { user, body });
        expect(reply.status, `${user.label} ${method} ${path}`).toBe(403);
      }
    }
    // Nothing changed: the admin is still an admin.
    const still = await call("GET", w.academy.path("/dashboard"), {
      user: w.admin,
    });
    expect(still.status).toBe(200);
  });

  it("the owner lists academies, without QR nonces or coordinates leaking beyond the fields", async () => {
    const reply = await call("GET", "/api/v1/admin/academies?limit=200", {
      user: owner,
    });
    const body = expectStatus(reply, 200);
    expect(body).toHaveProperty("nextCursor");
    expect(reply.text).not.toContain("qrNonce");
    const nonce = (
      await db().organization.findUniqueOrThrow({
        where: { id: w.academy.id },
        select: { qrNonce: true },
      })
    ).qrNonce;
    expect(reply.text).not.toContain(nonce);
  });
});

describe("the owner creates an academy for its first admin (PA-1)", () => {
  it("firstAdmin by userId: that user is the academy's admin; the owner is not a member", async () => {
    const firstAdmin = await signUp("first-admin");
    const academy = await createAcademy({ userId: firstAdmin.id });
    expect(academy.firstAdmin.status).toBe("member");
    expect(academy).not.toHaveProperty("qrNonce");
    const dashboard = await call(
      "GET",
      `/api/v1/academies/${academy.id}/dashboard`,
      { user: firstAdmin }
    );
    expect(dashboard.status).toBe(200);
    const asOwner = await call(
      "GET",
      `/api/v1/academies/${academy.id}/dashboard`,
      { user: owner }
    );
    expect(asOwner.status).toBe(404);
    const ownerRow = await db().member.findFirst({
      where: { organizationId: academy.id, userId: owner.id },
    });
    expect(ownerRow).toBeNull();
    // The academy works end to end: its admin can print a QR code.
    const qr = await call("GET", `/api/v1/academies/${academy.id}/academy-qr`, {
      user: firstAdmin,
    });
    expect(qr.status).toBe(200);
    // And the creation is in the platform audit log.
    const audit = await call(
      "GET",
      `/api/v1/admin/audit-log?academyId=${academy.id}`,
      { user: owner }
    );
    const actions = expectStatus(audit, 200).data.map(
      (row: Body) => row.action
    );
    expect(actions).toContain("academy.create");
  });

  it("firstAdmin by email with no account: invited, then accepted after sign-up", async () => {
    const email = `e2e-invitee-${uniqueSuffix()}@test.hoops-genesis.local`;
    const academy = await createAcademy({ email });
    expect(academy.firstAdmin.status).toBe("invited");
    const invitee = await signUp("invitee", email);
    // The id comes from the owner's response here; see KNOWN DEFECT D6 for
    // how the invitee is meant to find it.
    const accepted = await authCall(
      "/organization/accept-invitation",
      { invitationId: academy.firstAdmin.invitation.id },
      invitee
    );
    expect(accepted.status, accepted.text).toBe(200);
    const dashboard = await call(
      "GET",
      `/api/v1/academies/${academy.id}/dashboard`,
      { user: invitee }
    );
    expect(dashboard.status).toBe(200);
  });

  // KNOWN DEFECT D6: no invitation or verification email is configured, so
  // every user's emailVerified stays false and Better Auth 1.7.12 refuses
  // list-user-invitations (EMAIL_VERIFICATION_REQUIRED_FOR_INVITATION). The
  // invitee has no way to learn the invitation id, which the admin-academies
  // header says they get from organization.listUserInvitations (ST-1, AO-1).
  it.fails("KNOWN DEFECT D6: a freshly signed-up invitee can list their invitation", async () => {
    const email = `e2e-lister-${uniqueSuffix()}@test.hoops-genesis.local`;
    const academy = await createAcademy({ email });
    const invitee = await signUp("lister", email);
    const list = await authGet("/organization/list-user-invitations", invitee);
    const found = expectStatus(list, 200).find(
      (row: Body) => row.organizationId === academy.id
    );
    expect(found?.role).toBe("admin");
  });

  it("refuses a platform admin as first admin (422), a taken slug (409), and bad coordinates (400)", async () => {
    const otherOwner = await signUp("owner2");
    await setPlatformRole(otherOwner.id, "admin");
    const asMember = await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: academyBody({ userId: otherOwner.id }),
    });
    expect(asMember.status).toBe(422);
    expect(asMember.body.error.code).toBe("platform_admin_cannot_be_member");
    const self = await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: academyBody({ userId: owner.id }),
    });
    expect(self.status).toBe(422);
    const taken = await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: { ...academyBody({ userId: w.coach.id }), slug: w.academy.slug },
    });
    expect(taken.status).toBe(409);
    const noPin = await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: { ...academyBody({ userId: w.coach.id }), latitude: 200 },
    });
    expect(noPin.status).toBe(400);
    const both = await call("POST", "/api/v1/admin/academies", {
      user: owner,
      body: academyBody({ userId: w.coach.id, email: "x@y.z" }),
    });
    expect(both.status).toBe(400);
  });
});

describe("appointing and removing academy admins", () => {
  it("appoint a coach as admin; again -> 409; remove -> back to coach", async () => {
    const path = `/api/v1/admin/academies/${w.academy.id}/admins`;
    const appoint = await call("POST", path, {
      user: owner,
      body: { userId: w.coach2.id },
    });
    expect(appoint.status, appoint.text).toBe(201);
    const row = await db().member.findFirstOrThrow({
      where: { organizationId: w.academy.id, userId: w.coach2.id },
    });
    expect(row.role.split(",").sort()).toEqual(["admin", "coach"]);
    const again = await call("POST", path, {
      user: owner,
      body: { userId: w.coach2.id },
    });
    expect(again.status).toBe(409);
    const removed = await call("DELETE", `${path}/${w.coach2.id}`, {
      user: owner,
    });
    expect(removed.status).toBe(204);
    const after = await db().member.findFirstOrThrow({
      where: { organizationId: w.academy.id, userId: w.coach2.id },
    });
    expect(after.role).toBe("coach");
    const notAdmin = await call("DELETE", `${path}/${w.coach2.id}`, {
      user: owner,
    });
    expect(notAdmin.status).toBe(404);
  });

  it("pending admin invitation: owner cancels it; an unknown one -> 404", async () => {
    const email = `e2e-pending-${uniqueSuffix()}@test.hoops-genesis.local`;
    const reply = await call(
      "POST",
      `/api/v1/admin/academies/${w.academy.id}/admins`,
      { user: owner, body: { email } }
    );
    const appointment = expectStatus(reply, 201).data;
    expect(appointment.status).toBe("invited");
    const cancel = await call(
      "DELETE",
      `/api/v1/admin/academies/${w.academy.id}/admin-invitations/${appointment.invitation.id}`,
      { user: owner }
    );
    expect(cancel.status).toBe(204);
    const again = await call(
      "DELETE",
      `/api/v1/admin/academies/${w.academy.id}/admin-invitations/${appointment.invitation.id}`,
      { user: owner }
    );
    expect(again.status).toBe(404);
  });

  it("an unknown academy -> 404 on every owner route", async () => {
    const id = randomUUID();
    for (const [method, path, body] of [
      ["DELETE", `/api/v1/admin/academies/${id}`],
      ["POST", `/api/v1/admin/academies/${id}/admins`, { userId: w.coach.id }],
    ] as const) {
      const reply = await call(method, path, { user: owner, body });
      expect(reply.status, `${method} ${path}`).toBe(404);
    }
  });
});

describe("deleting academies", () => {
  it("an academy with no history can be deleted", async () => {
    const firstAdmin = await signUp("short-lived");
    const academy = await createAcademy({ userId: firstAdmin.id });
    const reply = await call(
      "DELETE",
      `/api/v1/admin/academies/${academy.id}`,
      {
        user: owner,
      }
    );
    expect(reply.status, reply.text).toBe(204);
    const gone = await call(
      "GET",
      `/api/v1/academies/${academy.id}/dashboard`,
      { user: firstAdmin }
    );
    expect(gone.status).toBe(404);
  });

  it("an academy with fees or audit rows -> 409 academy_has_history", async () => {
    await recordFee(w.academy, w.admin, w.student.id);
    const reply = await call(
      "DELETE",
      `/api/v1/admin/academies/${w.academy.id}`,
      { user: owner }
    );
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("academy_has_history");
  });
});

describe("the platform owner on academy routes is a non-member (404)", () => {
  it("every academy route answers 404, never data", async () => {
    const today = todayIn(w.academy);
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const paths: [string, string][] = [
      ["GET", w.academy.path("/dashboard")],
      ["GET", w.academy.path("/attendance")],
      ["GET", w.academy.path("/fees")],
      ["GET", w.academy.path("/fees/outstanding")],
      ["GET", w.academy.path("/audit-log")],
      ["GET", w.academy.path(`/events?from=${today}&to=${today}`)],
      ["GET", w.academy.path(`/events/${event.id}`)],
      ["GET", w.academy.path("/academy-qr")],
      ["POST", w.academy.path("/academy-qr/regenerate")],
      ["GET", w.academy.path("/records")],
      ["GET", `/api/v1/me/fees?academyId=${w.academy.id}`],
    ];
    for (const [method, path] of paths) {
      const reply = await call(method, path, { user: owner });
      expect(reply.status, `${method} ${path}: ${reply.text}`).toBe(404);
    }
  });

  it("the owner cannot write either (record a fee, void, create an event)", async () => {
    const fee = await call("POST", w.academy.path("/fees"), {
      user: owner,
      idempotencyKey: true,
      body: { studentId: w.student.id },
    });
    expect(fee.status).toBe(404);
    const event = await call("POST", w.academy.path("/events"), {
      user: owner,
      body: { title: "x", eventType: "training", startDate: "2030-01-01" },
    });
    expect(event.status).toBe(404);
  });

  // Was KNOWN DEFECT D5 (fixed in round 3): an academy admin invites the platform owner as a coach
  // through Better Auth and the owner accepts: the owner becomes a member
  // (and so passes academy routes as a coach). Expected: refused, as
  // /api/v1/admin/* refuses it (422 platform_admin_cannot_be_member).
  it("FIXED D5: the owner cannot become a member through Better Auth (invite + accept)", async () => {
    const owner2 = await signUp("owner-joiner");
    await setPlatformRole(owner2.id, "admin");
    const invite = await authCall(
      "/organization/invite-member",
      { email: owner2.email, role: "coach", organizationId: w.academy.id },
      w.admin
    );
    // Refused when the invitation is created (403).
    expect(invite.status, invite.text).toBe(403);
    const row = await db().member.findFirst({
      where: { organizationId: w.academy.id, userId: owner2.id },
    });
    expect(row).toBeNull();
  });
});
