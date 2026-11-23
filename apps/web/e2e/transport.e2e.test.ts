/**
 * Transport-level behaviour and data leaks: content type, malformed and
 * oversized bodies, unsupported methods, cache headers, and no storage keys,
 * coordinates, QR nonce or other users' emails where they should not be.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { FAR } from "./helpers/clock";
import { type Body, call, isErrorEnvelope, type User } from "./helpers/http";
import { readQrNonce } from "./helpers/seed";
import {
  buildWorld,
  createOpenEvent,
  createRecord,
  expectStatus,
  feeBody,
  getQrToken,
  recordAttendance,
  recordFee,
  scan,
  todayIn,
  type World,
} from "./helpers/world";

const ONE_AND_A_BIT_MB = 1_100_000;
const ALLOW_SEPARATOR = /,\s*/;

let w: World;
let today: string;

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
});

describe("request bodies", () => {
  it("a JSON body sent as text/plain -> 400 unsupported_content_type", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      rawBody: JSON.stringify(feeBody(w.student.id)),
      headers: { "content-type": "text/plain" },
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.code).toBe("unsupported_content_type");
  });

  it("a form post to an endpoint that reads a body -> 400", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      rawBody: "a=1",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(reply.status, reply.text).toBe(400);
  });

  // Was KNOWN DEFECT D3 (fixed in round 3): body-less POSTs (QR regenerate, attendance tick) never
  // read the body, so the content-type check that validation.ts says "stops
  // cross-site form posts" does not run. SameSite=Lax cookies limit the
  // risk in browsers, but the stated protection is missing.
  it("FIXED D3: a form post to a body-less POST -> 400", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.admin, event.id, [
      w.student.id,
    ]);
    for (const path of [
      w.academy.path("/academy-qr/regenerate"),
      w.academy.path(`/attendance/${row.id}/verify`),
    ]) {
      const reply = await call("POST", path, {
        user: w.admin,
        rawBody: "a=1",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      });
      expect(reply.status, `${path}: ${reply.text}`).toBe(400);
    }
  });

  it("malformed JSON -> 400 invalid_json", async () => {
    const reply = await call("POST", w.academy.path("/events"), {
      user: w.admin,
      rawBody: '{"title": ',
      headers: { "content-type": "application/json" },
    });
    expect(reply.status).toBe(400);
    expect(reply.body.error.code).toBe("invalid_json");
  });

  it("a JSON array or string body -> 400", async () => {
    for (const raw of ["[]", '"hello"', "null", "42"]) {
      const reply = await call("POST", w.academy.path("/events"), {
        user: w.admin,
        rawBody: raw,
        headers: { "content-type": "application/json" },
      });
      expect(reply.status, raw).toBe(400);
      expect(isErrorEnvelope(reply.body)).toBe(true);
    }
  });

  it("an oversized body -> 400 body_too_large (or 413)", async () => {
    const reply = await call("POST", w.academy.path("/events"), {
      user: w.admin,
      rawBody: JSON.stringify({ title: "x".repeat(ONE_AND_A_BIT_MB) }),
      headers: { "content-type": "application/json" },
    });
    expect([400, 413]).toContain(reply.status);
    expect(isErrorEnvelope(reply.body), reply.text.slice(0, 200)).toBe(true);
  });

  it("an oversized webhook body is refused before signature work", async () => {
    const reply = await call("POST", "/api/v1/webhooks/payments/generic", {
      rawBody: "x".repeat(ONE_AND_A_BIT_MB),
      headers: { "content-type": "application/json" },
    });
    expect([400, 401, 404, 413]).toContain(reply.status);
    expect(reply.status).not.toBe(500);
  });
});

describe("bodiless DELETE as real clients send it", () => {
  // FIXED D7: fetch (browsers, Node, React Native) sends a bodiless DELETE
  // with no Content-Length and no Content-Type. That must count as an empty
  // body and reach the handler.
  it("FIXED D7: a bare DELETE reaches the handler", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const reply = await call("DELETE", w.academy.path(`/events/${event.id}`), {
      user: w.admin,
    });
    expect(reply.status, reply.text).toBe(204);
  });

  it("FIXED D7: a bare DELETE without a session gets 401, not a content-type error", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const reply = await call(
      "DELETE",
      w.academy.path(`/events/${event.id}`),
      {}
    );
    expect(reply.status).toBe(401);
  });
});

describe("methods and unknown paths", () => {
  it("GET on a POST-only route changes nothing", async () => {
    const nonce = await readQrNonce(w.academy.id);
    await call("GET", w.academy.path("/academy-qr/regenerate"), {
      user: w.admin,
    });
    expect(await readQrNonce(w.academy.id)).toBe(nonce);
  });

  it("FIXED D1: wrong method on an API route -> 405 JSON envelope", async () => {
    const cases: [string, string][] = [
      ["GET", "/api/v1/attendance/scan"],
      ["PUT", w.academy.path("/attendance")],
      ["DELETE", w.academy.path("/fees")],
      ["GET", w.academy.path("/uploads")],
      ["GET", "/api/v1/webhooks/payments/generic"],
    ];
    for (const [method, path] of cases) {
      const reply = await call(method, path, { user: w.admin });
      expect(reply.status, `${method} ${path}`).toBe(405);
      expect(isErrorEnvelope(reply.body)).toBe(true);
      expect(reply.body.error.code).toBe("method_not_allowed");
      const allow = reply.headers.get("allow") ?? "";
      expect(allow, `${method} ${path}`).not.toBe("");
      expect(allow.split(ALLOW_SEPARATOR)).not.toContain(method);
    }
  });

  it("/api/auth/* and app pages are unaffected by the /api/v1 layout route", async () => {
    const session = await call("GET", "/api/auth/get-session", {
      user: w.admin,
      headers: { origin: "http://localhost:3001" },
    });
    expect(session.status).toBe(200);
    expect(session.body.user.id).toBe(w.admin.id);
    const page = await call("GET", "/login");
    expect(page.status).toBe(200);
    expect(page.headers.get("content-type")).toContain("text/html");
  });

  it("FIXED D2: an unknown /api/v1 path -> 404 JSON envelope", async () => {
    const reply = await call("GET", "/api/v1/no-such-thing", {
      user: w.admin,
    });
    expect(reply.status).toBe(404);
    expect(reply.headers.get("content-type")).toContain("application/json");
    expect(isErrorEnvelope(reply.body)).toBe(true);
  });
});

describe("response headers", () => {
  it("success and error responses are cache-control: no-store, JSON", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const replies = await Promise.all([
      call("GET", w.academy.path("/dashboard"), { user: w.admin }),
      call("GET", w.academy.path(`/events/${event.id}`), { user: w.student }),
      call("GET", w.academy.path("/dashboard")),
      call("GET", w.academy.path("/dashboard"), { user: w.coach }),
      call("GET", w.academy.path("/dashboard"), { user: w.outsider }),
      call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
        user: w.student,
      }),
      call("GET", w.academy.path("/academy-qr"), { user: w.admin }),
    ]);
    for (const reply of replies) {
      expect(reply.headers.get("cache-control"), reply.text).toBe("no-store");
      expect(reply.headers.get("content-type")).toContain("application/json");
    }
  });

  it("204 responses are no-store too", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const reply = await call("DELETE", w.academy.path(`/events/${event.id}`), {
      user: w.admin,
    });
    expect(reply.status).toBe(204);
    expect(reply.headers.get("cache-control")).toBe("no-store");
  });
});

describe("no leaks", () => {
  const forbiddenKeys = [
    "latitude",
    "longitude",
    "qrNonce",
    "fileUrl",
    "password",
  ];

  const keysIn = (value: unknown, found = new Set<string>()): Set<string> => {
    if (Array.isArray(value)) {
      for (const item of value) {
        keysIn(item, found);
      }
    } else if (value && typeof value === "object") {
      for (const [key, inner] of Object.entries(value)) {
        found.add(key);
        keysIn(inner, found);
      }
    }
    return found;
  };

  const assertClean = (reply: { text: string; body: Body }, nonce: string) => {
    const keys = keysIn(reply.body);
    for (const key of forbiddenKeys) {
      expect(keys.has(key), `${key} in ${reply.text.slice(0, 200)}`).toBe(
        false
      );
    }
    expect(reply.text).not.toContain(nonce);
  };

  it("GET /academy-qr and regenerate return the code in the same shape", async () => {
    const got = await call("GET", w.academy.path("/academy-qr"), {
      user: w.admin,
    });
    const regen = await call("POST", w.academy.path("/academy-qr/regenerate"), {
      user: w.admin,
    });
    // Both top level since round 3 (`{ token, deepLink }`, API document).
    expect(Object.keys(got.body).sort()).toEqual(["deepLink", "token"]);
    expect(Object.keys(regen.body).sort()).toEqual(["deepLink", "token"]);
    expect(regen.body.token).not.toBe(got.body.token);
  });

  it("the QR token never contains the nonce; the regenerate audit row neither", async () => {
    const { token, deepLink } = await getQrToken(w.academy, w.admin);
    const nonce = await readQrNonce(w.academy.id);
    const decoded = token
      .split(".")
      .map((part) => Buffer.from(part, "base64url").toString("utf8"))
      .join(" ");
    expect(token).not.toContain(nonce);
    expect(decoded).not.toContain(nonce);
    expect(deepLink).not.toContain(nonce);
    await call("POST", w.academy.path("/academy-qr/regenerate"), {
      user: w.admin,
    });
    const fresh = await readQrNonce(w.academy.id);
    const audit = await call(
      "GET",
      w.academy.path("/audit-log?action=academy_qr.regenerate"),
      { user: w.admin }
    );
    expect(audit.text).not.toContain(nonce);
    expect(audit.text).not.toContain(fresh);
  });

  it("scan replies, attendance rows and records carry no coordinates, nonce or storage key", async () => {
    const nonce = await readQrNonce(w.academy.id);
    const { token } = await getQrToken(w.academy, w.admin);
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const replies = [
      await scan(w.student, { token, eventId: event.id, sessionDate: today }),
      await scan(w.student2, {
        token,
        eventId: event.id,
        sessionDate: today,
        ...FAR,
      }),
      await call("GET", w.academy.path("/attendance"), { user: w.coach }),
      await call("GET", `/api/v1/me/attendance?academyId=${w.academy.id}`, {
        user: w.student,
      }),
      await call("GET", w.academy.path(`/events?from=${today}&to=${today}`), {
        user: w.student,
      }),
    ];
    const record = await createRecord(
      w.academy,
      w.student,
      w.student.id,
      "academic"
    );
    replies.push(
      await call("GET", w.academy.path(`/records/${record.id}`), {
        user: w.student,
      }),
      await call("GET", w.academy.path("/records"), { user: w.coach })
    );
    for (const reply of replies) {
      assertClean(reply, nonce);
    }
    // too_far tells the distance, not where the student is.
    const [, tooFar] = replies;
    expect(tooFar.body.error.code).toBe("too_far");
    expect(Object.keys(tooFar.body.error.details).sort()).toEqual([
      "distanceM",
      "radiusM",
    ]);
  });

  it("student-facing replies never contain another user's email", async () => {
    await recordFee(w.academy, w.admin, w.student.id);
    const record = await createRecord(
      w.academy,
      w.coach,
      w.student.id,
      "athletic"
    );
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    await recordAttendance(w.academy, w.coach, event.id, [w.student.id]);
    const others: User[] = [w.admin, w.coach, w.coach2, w.student2, w.studentB];
    const replies = await Promise.all([
      call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
        user: w.student,
      }),
      call("GET", `/api/v1/me/attendance?academyId=${w.academy.id}`, {
        user: w.student,
      }),
      call("GET", w.academy.path(`/students/${w.student.id}/records`), {
        user: w.student,
      }),
      call("GET", w.academy.path(`/records/${record.id}`), { user: w.student }),
      call("GET", w.academy.path(`/events?from=${today}&to=${today}`), {
        user: w.student,
      }),
      call("GET", w.academy.path(`/events/${event.id}`), { user: w.student }),
    ]);
    for (const reply of replies) {
      expect(reply.status, reply.text).toBe(200);
      for (const other of others) {
        expect(reply.text).not.toContain(other.email);
      }
    }
  });

  it("the outstanding list shows coaches their students' emails (documents are silent)", async () => {
    const reply = await call("GET", w.academy.path("/fees/outstanding"), {
      user: w.coach,
    });
    const body = expectStatus(reply, 200);
    const row = body.data.find(
      (item: Body) => item.student.id === w.student2.id
    );
    // Recorded as an observation for the report, not a pass/fail rule.
    expect(row?.student).toHaveProperty("email");
  });
});
