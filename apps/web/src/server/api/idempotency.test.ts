import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../services";
import { authenticate } from "./access";
import { writeAuditLog } from "./audit";
import { apiHandler } from "./handler";
import {
  IDEMPOTENCY_KEY_TTL_MS,
  IDEMPOTENT_REPLAY_HEADER,
  PURGE_BATCH_SIZE,
  purgeExpiredIdempotencyKeys,
  withIdempotency,
} from "./idempotency";
import {
  addMember,
  apiRequest,
  cleanup,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";
import { readJsonBody } from "./validation";

let academy: TestAcademy;
let leadAdmin: TestUser;

const WORK_DELAY_MS = 200;

/**
 * A stand-in POST endpoint: writes one audit row per real run, so the number
 * of rows for `entityId` counts how often the work ran.
 */
const createThing = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  const body = await readJsonBody(request);
  return withIdempotency(
    { request, userId: session.user.id, body, required: true },
    async (tx) => {
      const { entityId } = body as { entityId: string };
      // Long enough for a concurrent twin to arrive while this runs.
      await new Promise((resolve) => setTimeout(resolve, WORK_DELAY_MS));
      const row = await writeAuditLog(tx, {
        request,
        session,
        academyId: academy.id,
        action: "test.create",
        entityType: "test",
        entityId,
      });
      return { status: 201, body: { data: { id: row.id, entityId } } };
    }
  );
});

const post = (body: unknown, key?: string) =>
  createThing({
    request: apiRequest("/api/v1/things", {
      user: leadAdmin,
      method: "POST",
      body,
      headers: key ? { "idempotency-key": key } : {},
    }),
    params: {},
  });

const countRuns = (entityId: string) =>
  db.auditLog.count({ where: { academyId: academy.id, entityId } });

beforeAll(async () => {
  academy = await createTestAcademy();
  leadAdmin = await createTestUser("idem-leadAdmin");
  await addMember(academy, leadAdmin, "admin");
});

afterAll(async () => {
  await cleanup([academy], [leadAdmin]);
});

describe("withIdempotency", () => {
  it("requires the header when asked to", async () => {
    const response = await post({ entityId: "no-key" });
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("idempotency_key_required");
  });

  it("replays the first result for the same key and body", async () => {
    const key = `key-${runId()}`;
    const entityId = `replay-${runId()}`;
    const first = await post({ entityId, note: "n" }, key);
    expect(first.status).toBe(201);
    expect(first.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBeNull();
    const firstBody = await first.json();

    // Same body with keys in another order is the same request.
    const second = await post({ note: "n", entityId }, key);
    expect(second.status).toBe(201);
    expect(second.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(await second.json()).toEqual(firstBody);
    expect(await countRuns(entityId)).toBe(1);
  });

  it("409 for the same key with a different body", async () => {
    const key = `key-${runId()}`;
    const entityId = `conflict-${runId()}`;
    expect((await post({ entityId }, key)).status).toBe(201);
    const response = await post({ entityId: `${entityId}-changed` }, key);
    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe("idempotency_key_reused");
    expect(await countRuns(`${entityId}-changed`)).toBe(0);
  });

  it("runs the work once for two simultaneous requests", async () => {
    const key = `key-${runId()}`;
    const entityId = `race-${runId()}`;
    const [a, b] = await Promise.all([
      post({ entityId }, key),
      post({ entityId }, key),
    ]);
    expect([a.status, b.status]).toEqual([201, 201]);
    const replayed = [a, b].map((response) =>
      response.headers.get(IDEMPOTENT_REPLAY_HEADER)
    );
    expect(replayed.filter((value) => value === "true")).toHaveLength(1);
    expect(await a.json()).toEqual(await b.json());
    expect(await countRuns(entityId)).toBe(1);
  });

  it("scopes keys per user, method and path", async () => {
    const key = `key-${runId()}`;
    expect((await post({ entityId: `scope-${runId()}` }, key)).status).toBe(
      201
    );
    const stored = await db.idempotencyKey.findMany({ where: { key } });
    expect(stored).toHaveLength(1);
    expect(stored[0]?.scope).toBe(`${leadAdmin.id} POST /api/v1/things`);
  });
});

describe("writeAuditLog", () => {
  it("records actor, ip, user agent and JSON before/after in the transaction", async () => {
    const entityId = `audit-${runId()}`;
    const session = await authenticate(apiRequest("/", { user: leadAdmin }));
    const request = apiRequest("/api/v1/x", {
      user: leadAdmin,
      headers: {
        "x-forwarded-for": "203.0.113.9, 10.0.0.1",
        "user-agent": "vitest",
      },
    });
    await db.$transaction(async (tx) => {
      await writeAuditLog(tx, {
        request,
        session,
        academyId: academy.id,
        action: "fee.void",
        entityType: "fee",
        entityId,
        before: { voidedAt: null, at: new Date("2026-11-23T08:00:00Z") },
        after: { voidedAt: "2026-11-23T09:00:00.000Z" },
        reason: "duplicate",
      });
    });
    const row = await db.auditLog.findFirstOrThrow({ where: { entityId } });
    expect(row).toMatchObject({
      actorId: leadAdmin.id,
      ip: "203.0.113.9",
      userAgent: "vitest",
      reason: "duplicate",
      before: { voidedAt: null, at: "2026-11-23T08:00:00.000Z" },
    });
  });

  it("rolls back with the transaction, and audit rows cannot be changed", async () => {
    const entityId = `rollback-${runId()}`;
    const session = await authenticate(apiRequest("/", { user: leadAdmin }));
    await expect(
      db.$transaction(async (tx) => {
        await writeAuditLog(tx, {
          request: apiRequest("/"),
          session,
          academyId: academy.id,
          action: "fee.void",
          entityType: "fee",
          entityId,
        });
        throw new Error("change failed");
      })
    ).rejects.toThrow("change failed");
    expect(await db.auditLog.count({ where: { entityId } })).toBe(0);

    const existing = await db.auditLog.findFirstOrThrow({
      where: { academyId: academy.id },
    });
    await expect(
      db.auditLog.update({ where: { id: existing.id }, data: { reason: "x" } })
    ).rejects.toThrow();
  });
});

describe("purging old keys", () => {
  const HOUR_MS = 60 * 60 * 1000;
  const scopeOf = (label: string) => `${leadAdmin.id} POST /purge-${label}`;

  const insertKeys = (label: string, count: number, createdAt: Date) =>
    db.idempotencyKey.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        key: `${label}-${index}-${runId()}`,
        scope: scopeOf(label),
        requestHash: "hash",
        responseStatus: 201,
        responseBody: {},
        createdAt,
      })),
    });

  const countScope = (label: string) =>
    db.idempotencyKey.count({ where: { scope: scopeOf(label) } });

  it("storing a new key deletes keys older than 48 hours and keeps younger ones", async () => {
    const now = Date.now();
    await insertKeys(
      "expired",
      3,
      new Date(now - IDEMPOTENCY_KEY_TTL_MS - HOUR_MS)
    );
    await insertKeys(
      "young",
      2,
      new Date(now - IDEMPOTENCY_KEY_TTL_MS + HOUR_MS)
    );
    const response = await post(
      { entityId: `purge-${runId()}` },
      `purge-${runId()}`
    );
    expect(response.status).toBe(201);
    expect(await countScope("expired")).toBe(0);
    expect(await countScope("young")).toBe(2);
  });

  it("deletes at most PURGE_BATCH_SIZE rows per call, oldest first", async () => {
    const extra = 5;
    // Older than anything else in the database, so these go first.
    await insertKeys(
      "batch",
      PURGE_BATCH_SIZE + extra,
      new Date("2000-01-01T00:00:00.000Z")
    );
    const deleted = await purgeExpiredIdempotencyKeys();
    expect(deleted).toBe(PURGE_BATCH_SIZE);
    expect(await countScope("batch")).toBe(extra);
    let rounds = 0;
    // biome-ignore lint/performance/noAwaitInLoops: each purge waits for the last
    while ((await purgeExpiredIdempotencyKeys()) > 0 && rounds < 100) {
      rounds += 1;
    }
    expect(await countScope("batch")).toBe(0);
  });

  it("a replay does not purge, and a purge failure never fails the request", async () => {
    const key = `replay-purge-${runId()}`;
    const body = { entityId: `replay-purge-${runId()}` };
    expect((await post(body, key)).status).toBe(201);
    await insertKeys(
      "after-first",
      1,
      new Date(Date.now() - IDEMPOTENCY_KEY_TTL_MS - HOUR_MS)
    );
    const replay = await post(body, key);
    expect(replay.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(await countScope("after-first")).toBe(1);
    // An invalid date makes the delete fail; the error is swallowed.
    expect(await purgeExpiredIdempotencyKeys(new Date(Number.NaN))).toBe(0);
    await db.idempotencyKey.deleteMany({
      where: { scope: scopeOf("after-first") },
    });
  });
});
