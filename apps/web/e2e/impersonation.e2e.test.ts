/**
 * Impersonation and bans through Better Auth's admin endpoints (API
 * endpoints, "Access by role": owner "Ban, unban or impersonate users";
 * "For hands-on support the owner uses impersonation, which the audit log
 * records"; User stories PA-2).
 */
import { beforeAll, describe, expect, it } from "vitest";

import {
  authCall,
  type Body,
  call,
  type Reply,
  signIn,
  signUp,
  type User,
} from "./helpers/http";
import { seedMember, setPlatformRole } from "./helpers/seed";
import {
  auditRows,
  buildWorld,
  expectStatus,
  recordFee,
  type World,
} from "./helpers/world";

const MAX_AGE_ZERO = /max-age=0\b/i;
const TOKEN_WORD = /token/i;

let w: World;
let owner: User;

/** Applies a reply's Set-Cookie headers to a cookie header string. */
const applyCookies = (cookie: string, reply: Reply): string => {
  const jar = new Map(
    cookie
      .split("; ")
      .filter(Boolean)
      .map((pair) => {
        const index = pair.indexOf("=");
        return [pair.slice(0, index), pair.slice(index + 1)] as const;
      })
  );
  for (const set of reply.headers.getSetCookie()) {
    const [pair = "", ...attributes] = set.split(";");
    const index = pair.indexOf("=");
    const name = pair.slice(0, index).trim();
    const value = pair.slice(index + 1);
    const expired = attributes.some((attribute) =>
      MAX_AGE_ZERO.test(attribute.trim())
    );
    if (expired || value === "") {
      jar.delete(name);
    } else {
      jar.set(name, value);
    }
  }
  return [...jar].map(([name, value]) => `${name}=${value}`).join("; ");
};

const ownerAudit = async (query: Record<string, string>): Promise<Body[]> => {
  const params = new URLSearchParams({ limit: "200", ...query });
  return expectStatus(
    await call("GET", `/api/v1/admin/audit-log?${params}`, { user: owner }),
    200
  ).data;
};

beforeAll(async () => {
  w = await buildWorld();
  owner = await signUp("owner");
  await setPlatformRole(owner.id, "admin");
});

describe("the owner impersonates an academy admin (PA-2)", () => {
  let asAdmin: User;
  let feeId: string;

  it("impersonate-user starts a session as the admin and writes user.impersonate_start", async () => {
    const reply = await authCall(
      "/admin/impersonate-user",
      { userId: w.admin.id },
      owner
    );
    expect(reply.status, reply.text).toBe(200);
    asAdmin = { ...w.admin, cookie: applyCookies(owner.cookie, reply) };
    const me = await call("GET", "/api/auth/get-session", { user: asAdmin });
    expect(me.body.user.id).toBe(w.admin.id);
    expect(me.body.session.impersonatedBy).toBe(owner.id);
    const rows = await ownerAudit({
      action: "user.impersonate_start",
      entityId: w.admin.id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(owner.id);
    expect(rows[0].academyId).toBeNull();
    // Only ids and expiry, never a session token.
    expect(JSON.stringify(rows[0])).not.toMatch(TOKEN_WORD);
  });

  it("while impersonating, the academy routes see the admin", async () => {
    const dashboard = await call("GET", w.academy.path("/dashboard"), {
      user: asAdmin,
    });
    expect(dashboard.status).toBe(200);
  });

  it("a fee voided while impersonating records actor = admin, impersonatedBy = owner", async () => {
    feeId = (await recordFee(w.academy, w.admin, w.student.id)).id;
    const reply = await call("POST", w.academy.path(`/fees/${feeId}/void`), {
      user: asAdmin,
      body: { reason: "Support ticket 42" },
    });
    expect(reply.status, reply.text).toBe(200);
    const [row] = await auditRows(w.academy, w.admin, {
      entityId: feeId,
      action: "fee.void",
    });
    expect(row.actorId).toBe(w.admin.id);
    expect(row.actor).toEqual({ id: w.admin.id, name: w.admin.name });
    expect(row.impersonatedById).toBe(owner.id);
    expect(row.impersonatedBy).toEqual({ id: owner.id, name: owner.name });
    // The owner's view of the academy log says the same.
    const viaOwner = expectStatus(
      await call(
        "GET",
        `/api/v1/admin/academies/${w.academy.id}/audit-log?entityId=${feeId}&action=fee.void`,
        { user: owner }
      ),
      200
    ).data;
    expect(viaOwner[0].impersonatedById).toBe(owner.id);
  });

  it("the fee the admin recorded themselves (not impersonated) has impersonatedBy null", async () => {
    const [row] = await auditRows(w.academy, w.admin, {
      entityId: feeId,
      action: "fee.create",
    });
    expect(row.impersonatedById).toBeNull();
  });

  it("stop-impersonating returns to the owner and writes user.impersonate_stop", async () => {
    const reply = await authCall("/admin/stop-impersonating", {}, asAdmin);
    expect(reply.status, reply.text).toBe(200);
    const back = { ...owner, cookie: applyCookies(asAdmin.cookie, reply) };
    const me = await call("GET", "/api/auth/get-session", { user: back });
    expect(me.body.user.id).toBe(owner.id);
    const rows = await ownerAudit({
      action: "user.impersonate_stop",
      entityId: w.admin.id,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].actorId).toBe(owner.id);
    // The impersonation session is gone.
    const stale = await call("GET", w.academy.path("/dashboard"), {
      user: asAdmin,
    });
    expect(stale.status).toBe(401);
  });

  it("academy members cannot impersonate anyone", async () => {
    for (const user of [w.admin, w.coach]) {
      const reply = await authCall(
        "/admin/impersonate-user",
        { userId: w.student.id },
        user
      );
      expect(
        reply.status,
        `${user.label}: ${reply.text}`
      ).toBeGreaterThanOrEqual(400);
      expect(reply.status).toBeLessThan(500);
    }
    const rows = await ownerAudit({
      action: "user.impersonate_start",
      entityId: w.student.id,
    });
    expect(rows).toHaveLength(0);
  });
});

describe("bans", () => {
  it("a banned user's session stops working on /api/v1; unban lets them sign in again", async () => {
    const person = await signUp("bannable");
    await seedMember(w.academy.id, person.id, "student");
    const before = await call(
      "GET",
      `/api/v1/me/fees?academyId=${w.academy.id}`,
      { user: person }
    );
    expect(before.status).toBe(200);
    const ban = await authCall(
      "/admin/ban-user",
      { userId: person.id, banReason: "e2e" },
      owner
    );
    expect(ban.status, ban.text).toBe(200);
    const after = await call(
      "GET",
      `/api/v1/me/fees?academyId=${w.academy.id}`,
      { user: person }
    );
    expect(after.status, after.text).toBe(401);
    await expect(signIn(person)).rejects.toThrow();
    const unban = await authCall(
      "/admin/unban-user",
      { userId: person.id },
      owner
    );
    expect(unban.status, unban.text).toBe(200);
    const again = await signIn(person);
    const ok = await call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
      user: again,
    });
    expect(ok.status).toBe(200);
  });

  it("academy admins cannot ban", async () => {
    const reply = await authCall(
      "/admin/ban-user",
      { userId: w.student.id, banReason: "no" },
      w.admin
    );
    expect(reply.status).toBeGreaterThanOrEqual(400);
    const still = await call(
      "GET",
      `/api/v1/me/fees?academyId=${w.academy.id}`,
      { user: w.student }
    );
    expect(still.status).toBe(200);
  });
});
