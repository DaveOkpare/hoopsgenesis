/**
 * Impersonation in the audit trail: while the platform owner impersonates
 * someone (Better Auth admin `impersonateUser`), audited actions name both
 * the account used (actor_id) and the owner (impersonated_by), and starting
 * and stopping impersonation are audited themselves.
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
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";
import { listAcademyAuditLog } from "./v1/audit-log";
import { voidFee } from "./v1/fees";
import { deleteTestFees, insertFee } from "./v1/fees.fixtures";

const BASE_URL = "http://localhost:3001";
const EXPIRED_COOKIE = /max-age=0/i;

let academy: TestAcademy;
let owner: TestUser;
let academyAdmin: TestUser;
let student: TestUser;
let newStudent: TestUser;
let teamId: string;
/** academyAdmin's cookies while the owner impersonates them. */
let impersonationCookie: string;

/** Applies a response's Set-Cookie headers to a cookie header (last value wins). */
const applySetCookies = (cookie: string, headers: Headers): string => {
  const jar = new Map(
    cookie
      .split("; ")
      .filter((pair) => pair.includes("="))
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      })
  );
  for (const setCookie of headers.getSetCookie()) {
    const [pair = ""] = setCookie.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (value === "" || EXPIRED_COOKIE.test(setCookie)) {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

const postAuth = (path: string, cookie: string, body: unknown = {}) =>
  auth.handler(
    new Request(`${BASE_URL}/api/auth${path}`, {
      method: "POST",
      headers: {
        cookie,
        origin: BASE_URL,
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    })
  );

const asImpersonated = (): TestUser => ({
  ...academyAdmin,
  cookie: impersonationCookie,
});

beforeAll(async () => {
  academy = await createTestAcademy();
  [owner, academyAdmin, student, newStudent] = await Promise.all([
    createTestUser("owner", { platformRole: "admin" }),
    createTestUser("academy-admin"),
    createTestUser("student"),
    createTestUser("new-student"),
  ]);
  await Promise.all([
    addMember(academy, academyAdmin, "admin"),
    addMember(academy, student, "student"),
    addMember(academy, newStudent, "student"),
  ]);
  teamId = await createTeam(academy, [student]);

  const response = await postAuth("/admin/impersonate-user", owner.cookie, {
    userId: academyAdmin.id,
  });
  expect(response.status).toBe(200);
  impersonationCookie = applySetCookies(owner.cookie, response.headers);
});

afterAll(async () => {
  await deleteTestFees([academy]);
  await cleanup([academy], [owner, academyAdmin, student, newStudent]);
});

describe("impersonation", () => {
  it("the impersonation session belongs to the user and names the owner", async () => {
    const session = await auth.api.getSession({
      headers: new Headers({ cookie: impersonationCookie }),
    });
    expect(session?.user.id).toBe(academyAdmin.id);
    expect(session?.session.impersonatedBy).toBe(owner.id);
  });

  it("audits the start of impersonation, by the owner", async () => {
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "user.impersonate_start", entityId: academyAdmin.id },
    });
    expect(row).toMatchObject({
      academyId: null,
      actorId: owner.id,
      impersonatedById: null,
      entityType: "user",
      after: {
        userId: academyAdmin.id,
        impersonatedBy: owner.id,
        expiresAt: expect.any(String),
      },
    });
    expect(JSON.stringify(row)).not.toContain(
      impersonationCookie.split("=")[1] ?? "no-cookie"
    );
  });

  it("an action taken while impersonating records both users", async () => {
    const fee = await insertFee(academy, student.id, {
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      paidAt: new Date(),
    });
    const response = await voidFee({
      request: apiRequest(
        `/api/v1/academies/${academy.id}/fees/${fee.id}/void`,
        {
          user: asImpersonated(),
          method: "POST",
          body: { reason: "support fix" },
        }
      ),
      params: { academyId: academy.id, id: fee.id },
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      data: { voidedById: string; voidedBy: { id: string; name: string } };
    };
    // The account used is the academy admin's; the fee says so.
    expect(body.data.voidedBy).toEqual({
      id: academyAdmin.id,
      name: "academy-admin",
    });

    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "fee.void", entityId: fee.id },
    });
    expect(row.actorId).toBe(academyAdmin.id);
    expect(row.impersonatedById).toBe(owner.id);

    // The academy's audit log shows both, with names.
    const log = await listAcademyAuditLog({
      request: apiRequest(
        `/api/v1/academies/${academy.id}/audit-log?entityId=${fee.id}`,
        { user: academyAdmin }
      ),
      params: { academyId: academy.id },
    });
    const page = (await log.json()) as { data: Record<string, unknown>[] };
    expect(page.data).toEqual([
      expect.objectContaining({
        action: "fee.void",
        actorId: academyAdmin.id,
        actor: { id: academyAdmin.id, name: "academy-admin" },
        impersonatedById: owner.id,
        impersonatedBy: { id: owner.id, name: "owner" },
      }),
    ]);
  });

  it("a roster change made through Better Auth while impersonating records both users", async () => {
    const response = await postAuth(
      "/organization/add-team-member",
      impersonationCookie,
      { teamId, userId: newStudent.id, organizationId: academy.id }
    );
    expect(response.status).toBe(200);
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "team.member_add", entityId: teamId },
    });
    expect(row.actorId).toBe(academyAdmin.id);
    expect(row.impersonatedById).toBe(owner.id);
  });

  it("an action without impersonation has impersonated_by null", async () => {
    const fee = await insertFee(academy, student.id, {
      periodStart: "2026-12-01",
      periodEnd: "2026-12-31",
      paidAt: new Date(),
    });
    await voidFee({
      request: apiRequest(
        `/api/v1/academies/${academy.id}/fees/${fee.id}/void`,
        {
          user: academyAdmin,
          method: "POST",
          body: { reason: "own fix" },
        }
      ),
      params: { academyId: academy.id, id: fee.id },
    });
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "fee.void", entityId: fee.id },
    });
    expect(row.actorId).toBe(academyAdmin.id);
    expect(row.impersonatedById).toBeNull();
  });

  it("audits the end of impersonation, by the owner", async () => {
    const response = await postAuth(
      "/admin/stop-impersonating",
      impersonationCookie
    );
    expect(response.status).toBe(200);
    const row = await db.auditLog.findFirstOrThrow({
      where: { action: "user.impersonate_stop", entityId: academyAdmin.id },
    });
    expect(row).toMatchObject({
      academyId: null,
      actorId: owner.id,
      impersonatedById: null,
      entityType: "user",
      before: { userId: academyAdmin.id, impersonatedBy: owner.id },
    });
  });
});
