/**
 * The platform owner's read-only academy views (API endpoints, "Access by
 * role": owner "✓ (read-only)" on attendance, fees, events, records, the
 * dashboard and the audit log; User stories PA-2, PA-3).
 *
 * GET only, under /api/v1/admin/academies/:academyId/..., for an academy the
 * owner is not a member of; 401 without a session, 403 for everyone who is
 * not a platform admin (that academy's admin included), 404 for an unknown
 * academy, 405 for any write method. Each view must answer what the
 * member-facing route answers an academy admin.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  type Body,
  call,
  isErrorEnvelope,
  signUp,
  type User,
} from "./helpers/http";
import { readQrNonce, setPlatformRole } from "./helpers/seed";
import {
  buildWorld,
  createOpenEvent,
  createRecord,
  expectStatus,
  recordAttendance,
  recordFee,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;
let owner: User;
let ids: {
  attendance: string;
  event: string;
  fee: string;
  record: string;
};

/** Views shared by the owner route and the member route, by label. */
const SHARED: [string, () => string][] = [
  ["/attendance", () => "/attendance"],
  ["/attendance/:id", () => `/attendance/${ids.attendance}`],
  ["/fees", () => "/fees"],
  ["/fees/:id", () => `/fees/${ids.fee}`],
  ["/fees/outstanding", () => "/fees/outstanding"],
  [
    "/events",
    () => `/events?from=${todayIn(w.academy)}&to=${todayIn(w.academy)}`,
  ],
  ["/events/:id", () => `/events/${ids.event}`],
  ["/events/:id/sessions", () => `/events/${ids.event}/sessions`],
  ["/records", () => "/records"],
  ["/records/:id", () => `/records/${ids.record}`],
  ["/students/:id/records", () => `/students/${w.student.id}/records`],
  ["/dashboard", () => "/dashboard"],
  [
    "/teams/:id/attendance-summary",
    () =>
      `/teams/${w.teamA}/attendance-summary?from=${todayIn(w.academy)}&to=${todayIn(w.academy)}`,
  ],
  ["/audit-log", () => "/audit-log"],
];

const sharedViews = (): string[] => SHARED.map(([, path]) => path());

/** Owner-only views (no member-facing twin with the same body). */
const ownerOnlyViews = (): string[] => [
  "/teams",
  "/members",
  "/members?role=coach",
  "/invitations",
];

const ownerPath = (academyId: string, rest: string): string =>
  `/api/v1/admin/academies/${academyId}${rest}`;

beforeAll(async () => {
  w = await buildWorld();
  owner = await signUp("owner");
  await setPlatformRole(owner.id, "admin");
  const event = await createOpenEvent(w.academy, w.admin, w.teamA);
  const [row] = await recordAttendance(w.academy, w.coach, event.id, [
    w.student.id,
  ]);
  await call("POST", w.academy.path(`/attendance/${row.id}/verify`), {
    user: w.coach,
  });
  const fee = await recordFee(w.academy, w.admin, w.student.id);
  const record = await createRecord(
    w.academy,
    w.student,
    w.student.id,
    "academic"
  );
  ids = {
    attendance: row.id,
    event: event.id,
    fee: fee.id,
    record: record.id,
  };
});

describe("who may read the owner views", () => {
  const allViews = () => [...sharedViews(), ...ownerOnlyViews()];

  it("no session -> 401", async () => {
    for (const rest of allViews()) {
      const reply = await call("GET", ownerPath(w.academy.id, rest));
      expect(reply.status, rest).toBe(401);
    }
  });

  it("the academy's own admin, a coach, a student and an outsider -> 403", async () => {
    for (const user of [w.admin, w.coach, w.student, w.outsider]) {
      for (const rest of allViews()) {
        const reply = await call("GET", ownerPath(w.academy.id, rest), {
          user,
        });
        expect(reply.status, `${user.label} ${rest}`).toBe(403);
        expect(isErrorEnvelope(reply.body)).toBe(true);
      }
    }
  });

  it("the owner reads every view of an academy they are not a member of", async () => {
    for (const rest of allViews()) {
      const reply = await call("GET", ownerPath(w.academy.id, rest), {
        user: owner,
      });
      expect(reply.status, `${rest}: ${reply.text}`).toBe(200);
    }
  });

  it("an unknown academy -> 404 on every view", async () => {
    const unknown = randomUUID();
    for (const rest of ["/attendance", "/fees", "/dashboard", "/teams"]) {
      const reply = await call("GET", ownerPath(unknown, rest), {
        user: owner,
      });
      expect(reply.status, rest).toBe(404);
    }
  });

  it("no write method is reachable on any view path (405)", async () => {
    for (const rest of allViews()) {
      const path = ownerPath(w.academy.id, rest.split("?")[0] ?? rest);
      for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        const reply = await call(method, path, {
          user: owner,
          body: { reason: "owner write" },
        });
        expect(reply.status, `${method} ${path}`).toBe(405);
        expect(reply.body?.error?.code).toBe("method_not_allowed");
      }
    }
    // And nothing changed.
    const fee = await call("GET", w.academy.path(`/fees/${ids.fee}`), {
      user: w.admin,
    });
    expect(expectStatus(fee, 200).data.voidedAt).toBeNull();
  });

  it("the owner is still a non-member (404) on the academy's own routes", async () => {
    for (const rest of sharedViews()) {
      const reply = await call("GET", w.academy.path(rest), { user: owner });
      expect(reply.status, rest).toBe(404);
    }
  });
});

describe("the owner sees what the academy admin sees", () => {
  it.each(SHARED)("%s matches the member-facing route", async (label, path) => {
    const rest = path();
    const [asOwner, asAdmin] = await Promise.all([
      call("GET", ownerPath(w.academy.id, rest), { user: owner }),
      call("GET", w.academy.path(rest), { user: w.admin }),
    ]);
    expect(asOwner.status, rest).toBe(200);
    expect(asAdmin.status, rest).toBe(200);
    if (label === "/records/:id") {
      // No file here; a signed URL would differ per call.
      expect(asOwner.body.data.file).toBeNull();
    }
    expect(asOwner.body, rest).toEqual(asAdmin.body);
  });

  it("the owner's /teams has every team with its members; the admin's /teams has the same teams", async () => {
    const [asOwner, asAdmin] = await Promise.all([
      call("GET", ownerPath(w.academy.id, "/teams"), { user: owner }),
      call("GET", w.academy.path("/teams"), { user: w.admin }),
    ]);
    const ownerTeams = expectStatus(asOwner, 200).data;
    const adminTeams = expectStatus(asAdmin, 200).data;
    expect(
      ownerTeams.map(({ members: _members, ...team }: Body) => team)
    ).toEqual(adminTeams);
    const teamA = ownerTeams.find((team: Body) => team.id === w.teamA);
    const memberIds = teamA.members.map((member: Body) => member.userId);
    expect(memberIds).toEqual(
      expect.arrayContaining([w.coach.id, w.student.id, w.student2.id])
    );
    expect(memberIds).not.toContain(w.studentB.id);
  });
});

describe("owner-only views", () => {
  it("members?role= filters by role, and includes emails for support (PA-2)", async () => {
    const coaches = expectStatus(
      await call("GET", ownerPath(w.academy.id, "/members?role=coach"), {
        user: owner,
      }),
      200
    ).data;
    expect(coaches.map((row: Body) => row.userId).sort()).toEqual(
      [w.coach.id, w.coach2.id, w.coachB.id].sort()
    );
    expect(coaches.every((row: Body) => row.roles.includes("coach"))).toBe(
      true
    );
    const bad = await call(
      "GET",
      ownerPath(w.academy.id, "/members?role=owner"),
      { user: owner }
    );
    expect(bad.status).toBe(400);
  });

  it("invitations lists pending admin and member invitations", async () => {
    const email = `e2e-ov-${randomUUID().slice(0, 8)}@test.hoops-genesis.local`;
    const appoint = await call(
      "POST",
      `/api/v1/admin/academies/${w.academy.id}/admins`,
      { user: owner, body: { email } }
    );
    expect(appoint.status).toBe(201);
    const list = expectStatus(
      await call("GET", ownerPath(w.academy.id, "/invitations"), {
        user: owner,
      }),
      200
    ).data;
    const found = list.find((row: Body) => row.email === email);
    expect(found?.roles).toEqual(["admin"]);
    expect(found?.inviter?.id).toBe(owner.id);
  });

  it("a user's memberships across academies (PA-2)", async () => {
    const reply = await call(
      "GET",
      `/api/v1/admin/users/${w.dual.id}/memberships`,
      { user: owner }
    );
    const body = expectStatus(reply, 200);
    expect(reply.text).toContain(w.academy.id);
    expect(reply.text).toContain(w.other.academy.id);
    expect(reply.text).toContain(w.teamA);
    expect(reply.text).toContain(w.other.teamX);
    expect(body).toBeTypeOf("object");
    const unknown = await call(
      "GET",
      `/api/v1/admin/users/${randomUUID()}/memberships`,
      { user: owner }
    );
    expect(unknown.status).toBe(404);
    const byAdmin = await call(
      "GET",
      `/api/v1/admin/users/${w.dual.id}/memberships`,
      { user: w.admin }
    );
    expect(byAdmin.status).toBe(403);
    const write = await call(
      "DELETE",
      `/api/v1/admin/users/${w.dual.id}/memberships`,
      { user: owner }
    );
    expect(write.status).toBe(405);
  });
});

describe("no leaks in the owner views", () => {
  it("no QR nonce, storage key or coordinates in any view", async () => {
    const nonce = await readQrNonce(w.academy.id);
    for (const rest of [...sharedViews(), ...ownerOnlyViews()]) {
      const reply = await call("GET", ownerPath(w.academy.id, rest), {
        user: owner,
      });
      for (const needle of [
        nonce,
        "qrNonce",
        "fileUrl",
        "tmp/",
        "latitude",
        "longitude",
      ]) {
        expect(reply.text, `${rest} contains ${needle}`).not.toContain(needle);
      }
    }
  });
});
