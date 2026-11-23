import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import {
  addMember,
  apiRequest,
  cleanup,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { listAcademyAuditLog, listAdminAuditLog } from "./audit-log";

interface AuditItem {
  academyId: string | null;
  action: string;
  actorId: string | null;
  createdAt: string;
  entityId: string;
  entityType: string;
  id: string;
}

interface PageBody {
  data: AuditItem[];
  nextCursor: string | null;
}

const ROW_COUNT = 5;
const UTC_ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
// audit_log rows are permanent, so entity ids must be unique per run.
const RUN = runId();
const entity = (name: string) => `${name}-${RUN}`;

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let coach: TestUser;
let student: TestUser;
let outsider: TestUser;
let platformAdmin: TestUser;
/** entityIds of the seeded rows, newest first (createdAt desc, id desc). */
let newestFirst: string[] = [];

const academyPath = (academyId: string, query = "") =>
  `/api/v1/academies/${academyId}/audit-log${query}`;

const callAcademy = (
  user: TestUser | undefined,
  query = "",
  academyId?: string
) => {
  const id = academyId ?? academy.id;
  return listAcademyAuditLog({
    request: apiRequest(academyPath(id, query), { user }),
    params: { academyId: id },
  });
};

const callAdmin = (user: TestUser | undefined, query = "") =>
  listAdminAuditLog({
    request: apiRequest(`/api/v1/admin/audit-log${query}`, { user }),
    params: {},
  });

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(),
    createTestAcademy(),
  ]);
  [leadAdmin, coach, student, outsider, platformAdmin] = await Promise.all([
    createTestUser("lead-admin"),
    createTestUser("coach"),
    createTestUser("student"),
    createTestUser("outsider"),
    createTestUser("platform-admin", { platformRole: "user,admin" }),
  ]);
  await addMember(academy, leadAdmin, "admin");
  await addMember(academy, coach, "coach");
  await addMember(academy, student, "student");
  await addMember(otherAcademy, outsider, "admin");
  // Pairs of rows share a timestamp, so the id tie-break is exercised.
  const base = Date.now() - 60_000;
  const rows = await db.auditLog.createManyAndReturn({
    data: Array.from({ length: ROW_COUNT }, (_, index) => ({
      academyId: academy.id,
      actorId: leadAdmin.id,
      action: index % 2 === 0 ? "fee.void" : "attendance.void",
      entityType: index % 2 === 0 ? "fee" : "attendance",
      entityId: entity(`entity-${index}`),
      reason: "test",
      createdAt: new Date(base + Math.floor(index / 2)),
    })),
    select: { id: true, entityId: true, createdAt: true },
  });
  newestFirst = rows
    .sort(
      (a, b) =>
        b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1)
    )
    .map((row) => row.entityId);
  // A row in another academy, which academy routes must never return.
  await db.auditLog.create({
    data: {
      academyId: otherAcademy.id,
      actorId: outsider.id,
      action: "fee.void",
      entityType: "fee",
      entityId: entity("other-entity"),
    },
  });
});

afterAll(async () => {
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, coach, student, outsider, platformAdmin]
  );
});

describe("GET /api/v1/academies/:academyId/audit-log", () => {
  it("401 without a session, in the error envelope", async () => {
    const response = await callAcademy(undefined);
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });

  it("404 for a signed-in non-member, the same as a missing academy", async () => {
    const response = await callAcademy(outsider);
    expect(response.status).toBe(404);
    const missing = await callAcademy(outsider, "", "no-such-academy");
    expect(missing.status).toBe(404);
    expect(await response.json()).toEqual(await missing.json());
  });

  it("403 for a student and a coach (no audit:read)", async () => {
    expect((await callAcademy(student)).status).toBe(403);
    const response = await callAcademy(coach);
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("forbidden");
  });

  it("200 for an academy admin: newest first, paginated, this academy only", async () => {
    const seen: AuditItem[] = [];
    let cursor: string | null = null;
    let pages = 0;
    // Pages depend on the previous cursor, so they are fetched in sequence.
    do {
      const query: string = cursor ? `?limit=2&cursor=${cursor}` : "?limit=2";
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the last cursor
      const response = await callAcademy(leadAdmin, query);
      expect(response.status).toBe(200);
      const body = (await response.json()) as PageBody;
      expect(body.data.length).toBeLessThanOrEqual(2);
      seen.push(...body.data);
      cursor = body.nextCursor;
      pages += 1;
    } while (cursor);
    expect(pages).toBe(3);
    expect(seen.map((row) => row.entityId)).toEqual(newestFirst);
    expect(seen.every((row) => row.academyId === academy.id)).toBe(true);
    expect(seen[0]?.createdAt).toMatch(UTC_ISO_PATTERN);
  });

  it("filters by entityType, entityId, actorId, action and dates", async () => {
    const byType = (await (
      await callAcademy(leadAdmin, "?entityType=fee")
    ).json()) as PageBody;
    expect(byType.data.map((row) => row.entityId)).toEqual(
      newestFirst.filter((id) =>
        [0, 2, 4].some((index) => id === entity(`entity-${index}`))
      )
    );

    const byAction = (await (
      await callAcademy(leadAdmin, "?action=attendance.void")
    ).json()) as PageBody;
    expect(byAction.data).toHaveLength(2);

    const byEntity = (await (
      await callAcademy(leadAdmin, `?entityId=${entity("entity-3")}`)
    ).json()) as PageBody;
    expect(byEntity.data.map((row) => row.entityId)).toEqual([
      entity("entity-3"),
    ]);

    const byActor = (await (
      await callAcademy(leadAdmin, `?actorId=${coach.id}`)
    ).json()) as PageBody;
    expect(byActor.data).toHaveLength(0);

    const future = (await (
      await callAcademy(leadAdmin, "?from=2999-01-01")
    ).json()) as PageBody;
    expect(future.data).toHaveLength(0);
    const past = (await (
      await callAcademy(leadAdmin, "?to=2000-01-01")
    ).json()) as PageBody;
    expect(past.data).toHaveLength(0);
  });

  it("400 with issues for bad or unknown query params", async () => {
    const response = await callAcademy(leadAdmin, "?limit=500&colour=red");
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "limit" }),
        expect.objectContaining({ code: "unrecognized_keys" }),
      ])
    );
    const range = await callAcademy(
      leadAdmin,
      "?from=2026-12-01&to=2026-11-01"
    );
    expect((await range.json()).error.code).toBe("invalid_range");
    const cursor = await callAcademy(leadAdmin, "?cursor=garbage");
    expect((await cursor.json()).error.code).toBe("invalid_cursor");
  });
});

describe("GET /api/v1/admin/audit-log", () => {
  it("401 without a session, 403 for academy admins who are not platform admins", async () => {
    expect((await callAdmin(undefined)).status).toBe(401);
    expect((await callAdmin(leadAdmin)).status).toBe(403);
  });

  it("200 for a platform admin across academies, filterable by academyId", async () => {
    const all = (await (
      await callAdmin(platformAdmin, `?entityId=${entity("other-entity")}`)
    ).json()) as PageBody;
    expect(all.data.map((row) => row.academyId)).toEqual([otherAcademy.id]);

    const one = (await (
      await callAdmin(platformAdmin, `?academyId=${academy.id}&limit=200`)
    ).json()) as PageBody;
    expect(one.data).toHaveLength(ROW_COUNT);
    expect(one.nextCursor).toBeNull();
  });
});
