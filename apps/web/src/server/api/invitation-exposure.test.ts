/**
 * Invitation ids are the secret in an invitation link. Only academy admins
 * (coach and student invitations) and the platform owner (all of them) may
 * obtain one. This walks every Better Auth route and app route that returns
 * invitations and asserts on the raw response bodies.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, db } from "../../services";
import {
  addMember,
  apiRequest,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";
import {
  appointAcademyAdmin,
  cancelAdminInvitation,
  createAcademy,
} from "./v1/admin-academies";
import { adminListInvitations } from "./v1/admin-academy-views";
import { listAcademyAuditLog } from "./v1/audit-log";

const BASE_URL = "http://localhost:3001";
const HTTP_OK = 200;
const HTTP_FORBIDDEN = 403;
const FINGERPRINT = /^[0-9a-f]{12}$/;
const FINGERPRINT_ENTITY_ID = /^fp:[0-9a-f]{12}$/;

let academy: TestAcademy;
let admin: TestUser;
let coach: TestUser;
let student: TestUser;
let outsider: TestUser;
let owner: TestUser;
let teamId: string;
let coachInvitationId: string;
let studentInvitationId: string;
let adminInvitationId: string;
let cancelledAdminInvitationId: string;
let firstAdminInvitationId: string;
const academies: TestAcademy[] = [];

const newEmail = (label: string): string =>
  `${label}-${runId()}@test.hoops-genesis.local`;

/** A Better Auth route as `user`, through its HTTP handler. */
const authCall = (
  method: "GET" | "POST",
  path: string,
  user: TestUser,
  body?: unknown
): Promise<Response> =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method,
      headers: {
        cookie: user.cookie,
        origin: BASE_URL,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  );

const allIds = (): string[] => [
  coachInvitationId,
  studentInvitationId,
  adminInvitationId,
  cancelledAdminInvitationId,
];

const expectNoIds = (text: string, ids: readonly string[] = allIds()) => {
  for (const id of ids) {
    expect(text).not.toContain(id);
  }
};

const ownerAppoint = async (email: string): Promise<string> => {
  const response = await appointAcademyAdmin({
    request: apiRequest(`/api/v1/admin/academies/${academy.id}/admins`, {
      user: owner,
      method: "POST",
      body: { email },
    }),
    params: { academyId: academy.id },
  });
  const { data } = (await response.json()) as {
    data: { invitation: { id: string } };
  };
  return data.invitation.id;
};

beforeAll(async () => {
  academy = await createTestAcademy();
  academies.push(academy);
  [admin, coach, student, outsider] = await Promise.all(
    ["ex-admin", "ex-coach", "ex-student", "ex-outsider"].map((label) =>
      createTestUser(label)
    )
  );
  owner = await createTestUser("ex-owner", { platformRole: "admin" });
  await Promise.all([
    addMember(academy, admin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, student, "student"),
  ]);
  teamId = await createTeam(academy, [coach, student]);
  const invite = async (role: string, team?: string) => {
    const response = await authCall(
      "POST",
      "/organization/invite-member",
      admin,
      {
        email: newEmail(`ex-${role}`),
        role,
        organizationId: academy.id,
        ...(team ? { teamId: team } : {}),
      }
    );
    expect(response.status).toBe(HTTP_OK);
    return ((await response.json()) as { id: string }).id;
  };
  coachInvitationId = await invite("coach");
  studentInvitationId = await invite("student", teamId);
  adminInvitationId = await ownerAppoint(newEmail("ex-new-admin"));
  cancelledAdminInvitationId = await ownerAppoint(newEmail("ex-cancelled"));
  const cancel = await cancelAdminInvitation({
    request: apiRequest(
      `/api/v1/admin/academies/${academy.id}/admin-invitations/${cancelledAdminInvitationId}`,
      { user: owner, method: "DELETE" }
    ),
    params: { academyId: academy.id, id: cancelledAdminInvitationId },
  });
  expect(cancel.status).toBe(204);
  const slug = `ex-made-${runId()}`;
  const made = await createAcademy({
    request: apiRequest("/api/v1/admin/academies", {
      user: owner,
      method: "POST",
      body: {
        name: slug,
        slug,
        timezone: "Africa/Lagos",
        defaultCurrency: "NGN",
        latitude: 6.45,
        longitude: 3.39,
        firstAdmin: { email: newEmail("ex-first") },
      },
    }),
    params: {},
  });
  const { data } = (await made.json()) as {
    data: { id: string; firstAdmin: { invitation: { id: string } } };
  };
  academies.push({ id: data.id, slug });
  firstAdminInvitationId = data.firstAdmin.invitation.id;
});

afterAll(async () => {
  await db.invitation.deleteMany({
    where: { organizationId: { in: academies.map((row) => row.id) } },
  });
  await cleanup(academies, [admin, coach, student, outsider, owner]);
});

/** Status and raw body of each response, read in parallel. */
const read = (responses: readonly Response[]) =>
  Promise.all(
    responses.map(async (response) => ({
      status: response.status,
      text: await response.text(),
    }))
  );

describe("coaches and students obtain no invitation id from any route", () => {
  const callers = () => [coach, student, outsider];

  it("Better Auth: list-invitations is refused", async () => {
    const results = await read(
      await Promise.all(
        callers().map((user) =>
          authCall(
            "GET",
            `/organization/list-invitations?organizationId=${academy.id}`,
            user
          )
        )
      )
    );
    for (const { status, text } of results) {
      expect(status).toBe(HTTP_FORBIDDEN);
      expectNoIds(text);
    }
  });

  it("Better Auth: get-full-organization keeps members and teams but no invitations", async () => {
    const path = `/organization/get-full-organization?organizationId=${academy.id}`;
    const [coachResult, studentResult, outsiderResult] = await read(
      await Promise.all(callers().map((user) => authCall("GET", path, user)))
    );
    for (const { status, text } of [coachResult, studentResult]) {
      expect(status).toBe(HTTP_OK);
      expectNoIds(text);
      const body = JSON.parse(text) as {
        invitations: unknown[];
        members: unknown[];
        teams: { id: string }[];
      };
      expect(body.invitations).toEqual([]);
      expect(body.members.length).toBeGreaterThanOrEqual(3);
      expect(body.teams.map((team) => team.id)).toContain(teamId);
    }
    expect(outsiderResult?.status).toBe(HTTP_FORBIDDEN);
    expectNoIds(outsiderResult?.text ?? "");
  });

  it("Better Auth: get-invitation, list-user-invitations, accept, reject, cancel, invite answer without ids", async () => {
    const calls = callers().flatMap((user) => [
      authCall(
        "GET",
        `/organization/get-invitation?id=${coachInvitationId}`,
        user
      ),
      authCall("GET", "/organization/list-user-invitations", user),
      authCall("POST", "/organization/accept-invitation", user, {
        invitationId: studentInvitationId,
      }),
      authCall("POST", "/organization/reject-invitation", user, {
        invitationId: studentInvitationId,
      }),
      authCall("POST", "/organization/cancel-invitation", user, {
        invitationId: coachInvitationId,
      }),
      authCall("POST", "/organization/invite-member", user, {
        email: newEmail("ex-sneaky"),
        role: "student",
        organizationId: academy.id,
      }),
    ]);
    const results = await read(await Promise.all(calls));
    for (const { status, text } of results) {
      expect(status).toBeGreaterThanOrEqual(400);
      expectNoIds(text);
    }
    // Nothing changed.
    const statuses = await db.invitation.findMany({
      where: { id: { in: [coachInvitationId, studentInvitationId] } },
      select: { status: true },
    });
    expect(statuses.map((row) => row.status)).toEqual(["pending", "pending"]);
  });

  it("Better Auth admin plugin routes are closed to them", async () => {
    const results = await read(
      await Promise.all(
        callers().map((user) => authCall("GET", "/admin/list-users", user))
      )
    );
    for (const { status, text } of results) {
      expect(status).toBe(HTTP_FORBIDDEN);
      expectNoIds(text);
    }
  });

  it("app routes: academy audit log and the owner's invitation list are refused", async () => {
    const calls = callers().flatMap((user) => [
      listAcademyAuditLog({
        request: apiRequest(`/api/v1/academies/${academy.id}/audit-log`, {
          user,
        }),
        params: { academyId: academy.id },
      }),
      adminListInvitations({
        request: apiRequest(
          `/api/v1/admin/academies/${academy.id}/invitations`,
          { user }
        ),
        params: { academyId: academy.id },
      }),
    ]);
    const results = await read(await Promise.all(calls));
    for (const { status, text } of results) {
      expect(status).toBeGreaterThanOrEqual(HTTP_FORBIDDEN);
      expectNoIds(text);
    }
  });
});

describe("academy admins get coach and student invitation ids, never admin ones", () => {
  it("list-invitations and get-full-organization leave out admin invitations", async () => {
    const results = await read(
      await Promise.all(
        [
          `/organization/list-invitations?organizationId=${academy.id}`,
          `/organization/get-full-organization?organizationId=${academy.id}`,
        ].map((path) => authCall("GET", path, admin))
      )
    );
    for (const { status, text } of results) {
      expect(status).toBe(HTTP_OK);
      expect(text).toContain(coachInvitationId);
      expect(text).toContain(studentInvitationId);
      expectNoIds(text, [adminInvitationId, cancelledAdminInvitationId]);
    }
  });

  it("the academy audit log shows no invitation id", async () => {
    const response = await listAcademyAuditLog({
      request: apiRequest(`/api/v1/academies/${academy.id}/audit-log`, {
        user: admin,
      }),
      params: { academyId: academy.id },
    });
    expect(response.status).toBe(HTTP_OK);
    const text = await response.text();
    expect(text).toContain("academy.admin_invite");
    expectNoIds(text);
  });

  it("the owner still sees every pending invitation id", async () => {
    const response = await adminListInvitations({
      request: apiRequest(`/api/v1/admin/academies/${academy.id}/invitations`, {
        user: owner,
      }),
      params: { academyId: academy.id },
    });
    const text = await response.text();
    for (const id of [
      coachInvitationId,
      studentInvitationId,
      adminInvitationId,
    ]) {
      expect(text).toContain(id);
    }
  });
});

describe("audit rows never hold an invitation id", () => {
  it("academy.create, academy.admin_invite and academy.admin_invite_cancel carry fingerprints", async () => {
    const rows = await db.auditLog.findMany({
      where: {
        OR: [
          { academyId: academy.id },
          { entityId: { in: academies.map((row) => row.id) } },
        ],
      },
    });
    expect(rows.map((row) => row.action)).toEqual(
      expect.arrayContaining([
        "academy.create",
        "academy.admin_invite",
        "academy.admin_invite_cancel",
      ])
    );
    expectNoIds(JSON.stringify(rows), [...allIds(), firstAdminInvitationId]);
    const invite = rows.find((row) => row.action === "academy.admin_invite");
    expect(invite?.entityId).toMatch(FINGERPRINT_ENTITY_ID);
    expect(invite?.after).toMatchObject({
      idFingerprint: expect.stringMatching(FINGERPRINT),
    });
  });
});
