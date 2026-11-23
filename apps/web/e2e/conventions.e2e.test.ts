/**
 * Conventions (API endpoints, Conventions table): error envelope, unknown
 * keys, cursor pagination, money as decimal strings, dates in the academy's
 * time zone, Idempotency-Key, append-only resources.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { addDays, localNow, utcToday } from "./helpers/clock";
import { type Body, call, isErrorEnvelope } from "./helpers/http";
import { db } from "./helpers/seed";
import {
  buildWorld,
  createEvent,
  createOpenEvent,
  createRecord,
  expectStatus,
  feeBody,
  recordAttendance,
  recordFee,
  todayIn,
  type World,
  walkPages,
  ZONE_FAR_EAST,
  ZONE_FAR_WEST,
} from "./helpers/world";

let w: World;
let today: string;

const UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;
const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
});

describe("error envelope and unknown keys", () => {
  it("every error is { error: { code, message, details? } }", async () => {
    const replies = await Promise.all([
      call("GET", w.academy.path("/events")),
      call("GET", w.academy.path("/dashboard"), { user: w.coach }),
      call("GET", w.academy.path("/events"), { user: w.admin }),
      call("GET", w.academy.path(`/fees/${randomUUID()}`), { user: w.admin }),
      call("POST", w.academy.path("/fees"), {
        user: w.admin,
        idempotencyKey: true,
        body: { studentId: w.student.id },
      }),
    ]);
    expect(replies.map((reply) => reply.status)).toEqual([
      401, 403, 400, 404, 400,
    ]);
    for (const reply of replies) {
      expect(isErrorEnvelope(reply.body), reply.text).toBe(true);
    }
    expect(replies[4]?.body.error.code).toBe("validation_failed");
    expect(Array.isArray(replies[4]?.body.error.details.issues)).toBe(true);
  });

  it("unknown body keys are rejected, top level and nested", async () => {
    const top = await call("POST", w.academy.path("/events"), {
      user: w.admin,
      body: {
        title: "x",
        eventType: "training",
        startDate: today,
        createdById: w.coach.id,
      },
    });
    expect(top.status).toBe(400);
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const nested = await call("POST", w.academy.path("/attendance"), {
      user: w.admin,
      idempotencyKey: true,
      body: {
        eventId: event.id,
        sessionDate: today,
        entries: [
          { studentId: w.student.id, status: "present", recordedById: "x" },
        ],
      },
    });
    expect(nested.status).toBe(400);
    const void_ = await call(
      "POST",
      w.academy.path(`/fees/${randomUUID()}/void`),
      { user: w.admin, body: { reason: "x", voidedById: w.coach.id } }
    );
    expect(void_.status).toBe(400);
  });

  it("unknown query keys are rejected", async () => {
    const replies = await Promise.all([
      call("GET", w.academy.path(`/events?from=${today}&to=${today}&x=1`), {
        user: w.admin,
      }),
      call("GET", w.academy.path("/dashboard?x=1"), { user: w.admin }),
      call("GET", w.academy.path("/attendance?academyId=x"), { user: w.admin }),
      call("GET", w.academy.path("/fees?sort=amount"), { user: w.admin }),
      call("GET", w.academy.path("/audit-log?academyId=x"), { user: w.admin }),
    ]);
    for (const reply of replies) {
      expect(reply.status, reply.text).toBe(400);
    }
  });

  it("a non-member never gets a 400: membership is checked first", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.outsider,
      body: { nonsense: true },
    });
    expect(reply.status).toBe(404);
  });
});

describe("cursor pagination walks every row once", () => {
  const expectNoDupNoGap = (walked: Body[], whole: Body[]) => {
    const walkedIds = walked.map((row) => row.id ?? JSON.stringify(row));
    const wholeIds = whole.map((row) => row.id ?? JSON.stringify(row));
    expect(new Set(walkedIds).size).toBe(walkedIds.length);
    expect(walkedIds).toEqual(wholeIds);
  };

  it("events (one item per session day)", async () => {
    // A 5-day camp plus two single days: 7 occurrences in range.
    await createEvent(w.academy, w.admin, {
      startDate: addDays(today, 1),
      endDate: addDays(today, 5),
      title: "Camp",
    });
    await createEvent(w.academy, w.admin, { startDate: addDays(today, 2) });
    await createEvent(w.academy, w.admin, { startDate: addDays(today, 2) });
    const path = w.academy.path(
      `/events?from=${addDays(today, 1)}&to=${addDays(today, 6)}`
    );
    const whole = expectStatus(
      await call("GET", `${path}&limit=200`, { user: w.admin }),
      200
    ).data;
    expect(whole).toHaveLength(7);
    const { items, pages } = await walkPages(w.admin, path, 2);
    expect(pages).toBe(4);
    const key = (row: Body) => `${row.id}/${row.sessionDate}`;
    expect(items.map(key)).toEqual(whole.map(key));
    expect(new Set(items.map(key)).size).toBe(items.length);
  });

  it("attendance (many rows on the same session date)", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    await recordAttendance(w.academy, w.admin, event.id, [
      w.student.id,
      w.student2.id,
      w.dual.id,
    ]);
    const other = await createOpenEvent(w.academy, w.admin, w.teamB);
    await recordAttendance(w.academy, w.admin, other.id, [w.studentB.id]);
    const path = w.academy.path("/attendance");
    const whole = expectStatus(
      await call("GET", `${path}?limit=200`, { user: w.admin }),
      200
    ).data;
    expect(whole.length).toBeGreaterThanOrEqual(4);
    const { items } = await walkPages(w.admin, path, 1);
    expectNoDupNoGap(items, whole);
  });

  it("fees, audit log, outstanding list and record queue", async () => {
    for (const user of [w.student, w.student2, w.studentB]) {
      await recordFee(w.academy, w.admin, user.id);
      await recordFee(w.academy, w.admin, user.id);
      await createRecord(w.academy, user, user.id, "academic");
    }
    for (const rest of [
      "/fees",
      "/audit-log",
      "/fees/outstanding",
      "/records",
    ]) {
      const path = w.academy.path(rest);
      const whole = expectStatus(
        await call("GET", `${path}?limit=200`, { user: w.admin }),
        200
      ).data;
      expect(whole.length, rest).toBeGreaterThanOrEqual(3);
      const { items } = await walkPages(w.admin, path, 2);
      if (rest === "/fees/outstanding") {
        expect(items.map((row: Body) => row.student.id)).toEqual(
          whole.map((row: Body) => row.student.id)
        );
      } else {
        expectNoDupNoGap(items, whole);
      }
    }
  });

  it("limit defaults to 50, max 200; bad cursors are 400", async () => {
    const replies = await Promise.all([
      call("GET", w.academy.path("/fees?limit=201"), { user: w.admin }),
      call("GET", w.academy.path("/fees?limit=0"), { user: w.admin }),
      call("GET", w.academy.path("/fees?cursor=not-a-cursor"), {
        user: w.admin,
      }),
      call("GET", w.academy.path("/attendance?cursor=%%%"), { user: w.admin }),
    ]);
    for (const reply of replies) {
      expect(reply.status, reply.text).toBe(400);
    }
    const page = expectStatus(
      await call("GET", w.academy.path("/fees"), { user: w.admin }),
      200
    );
    expect(page).toHaveProperty("nextCursor");
    expect(page.data.length).toBeLessThanOrEqual(50);
  });
});

describe("money is an exact decimal string", () => {
  it.each([
    ["15000.5", "15000.50"],
    ["0.01", "0.01"],
    ["999999999999.99", "999999999999.99"],
    ["7", "7.00"],
  ])("amount %s comes back as %s", async (sent, back) => {
    const fee = await recordFee(w.academy, w.admin, w.student.id, {
      amount: sent,
    });
    expect(fee.amount).toBe(back);
    const read = expectStatus(
      await call("GET", w.academy.path(`/fees/${fee.id}`), { user: w.admin }),
      200
    ).data;
    expect(read.amount).toBe(back);
  });

  it.each<[string | number, string]>([
    [15_000, "a number"],
    ["0", "zero"],
    ["1.234", "three decimals"],
    ["-5.00", "negative"],
    ["1e3", "exponent"],
  ])("amount %s (%s) -> 400", async (amount: string | number) => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student.id, { amount }),
    });
    expect(reply.status).toBe(400);
  });
});

describe("dates are in the academy's time zone", () => {
  it("timestamps are UTC with Z, plain dates are YYYY-MM-DD", async () => {
    const fee = await recordFee(w.academy, w.admin, w.student.id);
    expect(fee.createdAt).toMatch(UTC_TIMESTAMP);
    expect(fee.paidAt).toMatch(UTC_TIMESTAMP);
    expect(fee.periodStart).toMatch(PLAIN_DATE);
  });

  it("the dashboard's today is the academy's local date", async () => {
    for (const academy of [w.academy, w.other.academy]) {
      const admin = academy === w.academy ? w.admin : w.other.admin;
      const { data } = expectStatus(
        await call("GET", academy.path("/dashboard"), { user: admin }),
        200
      );
      expect(data.today).toBe(localNow(academy.timezone).date);
    }
    // The two zones are 25 hours apart, so their dates always differ.
    expect(localNow(ZONE_FAR_EAST).date).not.toBe(localNow(ZONE_FAR_WEST).date);
  });

  it("a session's startsAt is the local time converted to UTC", async () => {
    const event = await createEvent(w.academy, w.admin, {
      teamId: w.teamA,
      startTime: "10:00",
      endTime: "11:30",
    });
    const { data } = expectStatus(
      await call("GET", w.academy.path(`/events/${event.id}/sessions`), {
        user: w.admin,
      }),
      200
    );
    // Kiritimati is UTC+14: 10:00 local is 20:00Z the day before.
    expect(data[0].startsAt).toBe(`${addDays(today, -1)}T20:00:00.000Z`);
    expect(data[0].endsAt).toBe(`${addDays(today, -1)}T21:30:00.000Z`);
  });

  it("manual attendance: local today is fine, local tomorrow is the future (422)", async () => {
    const camp = await createEvent(w.academy, w.admin, {
      teamId: w.teamA,
      startDate: today,
      endDate: addDays(today, 1),
      startTime: "00:00",
      endTime: "23:59",
      collectAttendance: true,
    });
    const okRows = await recordAttendance(
      w.academy,
      w.admin,
      camp.id,
      [w.student.id],
      { sessionDate: today }
    );
    expect(okRows[0].sessionDate).toBe(today);
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.admin,
      idempotencyKey: true,
      body: {
        eventId: camp.id,
        sessionDate: addDays(today, 1),
        entries: [{ studentId: w.student2.id, status: "present" }],
      },
    });
    expect(reply.status, reply.text).toBe(422);
    expect(reply.body.error.code).toBe("session_in_future");
  });

  it("the date filter on /attendance uses session dates, not UTC days", async () => {
    // Today in Kiritimati is UTC's tomorrow (or today after 10:00Z).
    const { data } = expectStatus(
      await call("GET", w.academy.path(`/attendance?date=${today}&limit=200`), {
        user: w.admin,
      }),
      200
    );
    expect(data.every((row: Body) => row.sessionDate === today)).toBe(true);
    expect(data.length).toBeGreaterThan(0);
    if (today !== utcToday()) {
      const utc = expectStatus(
        await call(
          "GET",
          w.academy.path(`/attendance?date=${utcToday()}&limit=200`),
          { user: w.admin }
        ),
        200
      ).data;
      expect(utc.every((row: Body) => row.sessionDate === utcToday())).toBe(
        true
      );
    }
  });

  it("the events range is limited to 92 days", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/events?from=${today}&to=${addDays(today, 92)}`),
      { user: w.admin }
    );
    expect(reply.status).toBe(400);
    const ok = await call(
      "GET",
      w.academy.path(`/events?from=${today}&to=${addDays(today, 91)}`),
      { user: w.admin }
    );
    expect(ok.status).toBe(200);
  });
});

describe("Idempotency-Key", () => {
  it("replay returns the first result; a different body with the same key is 409", async () => {
    const key = randomUUID();
    const body = feeBody(w.student2.id);
    const first = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: key,
      body,
    });
    expect(first.status).toBe(201);
    const again = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: key,
      body,
    });
    expect(again.status).toBe(201);
    expect(again.body.data.id).toBe(first.body.data.id);
    expect(again.headers.get("idempotent-replayed")).toBe("true");
    const reused = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: key,
      body: { ...body, amount: "1.00" },
    });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("idempotency_key_reused");
  });

  it("the key is required on fee, attendance and scan POSTs", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const replies = await Promise.all([
      call("POST", w.academy.path("/fees"), {
        user: w.admin,
        body: feeBody(w.student2.id),
      }),
      call("POST", w.academy.path("/attendance"), {
        user: w.admin,
        body: {
          eventId: event.id,
          sessionDate: today,
          entries: [{ studentId: w.student2.id, status: "present" }],
        },
      }),
      call("POST", "/api/v1/attendance/scan", {
        user: w.student,
        body: {
          token: "x",
          eventId: event.id,
          sessionDate: today,
          action: "check_in",
          latitude: 0,
          longitude: 0,
          accuracyM: 1,
        },
      }),
    ]);
    for (const reply of replies) {
      expect(reply.status, reply.text).toBe(400);
      expect(reply.body.error.code).toBe("idempotency_key_required");
    }
  });

  it("the same key from two users is two different requests", async () => {
    const key = randomUUID();
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const body = {
      eventId: event.id,
      sessionDate: today,
      entries: [{ studentId: w.student.id, status: "present" }],
    };
    const byAdmin = await call("POST", w.academy.path("/attendance"), {
      user: w.admin,
      idempotencyKey: key,
      body,
    });
    expect(byAdmin.status).toBe(201);
    const byCoach = await call("POST", w.academy.path("/attendance"), {
      user: w.coach,
      idempotencyKey: key,
      body,
    });
    // Not a replay of the admin's row: a real attempt, so a duplicate.
    expect(byCoach.status).toBe(409);
    expect(byCoach.headers.get("idempotent-replayed")).toBeNull();
  });

  it("keys older than 48 hours are purged when a new key is stored; younger ones replay", async () => {
    const path = w.academy.path("/fees");
    const scope = `${w.admin.id} POST ${path}`;
    const HOUR = 3_600_000;
    const oldKey = `e2e-old-${randomUUID()}`;
    const youngKey = `e2e-young-${randomUUID()}`;
    const stale = { data: { id: "stale-replay" } };
    for (const [key, ageHours] of [
      [oldKey, 49],
      [youngKey, 47],
    ] as const) {
      await db().idempotencyKey.create({
        data: {
          key,
          scope,
          requestHash: "seeded",
          responseStatus: 201,
          responseBody: stale,
          createdAt: new Date(Date.now() - ageHours * HOUR),
        },
      });
    }
    // Any new key triggers the purge.
    await call("POST", path, {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student.id),
    });
    const left = await db().idempotencyKey.findMany({
      where: { key: { in: [oldKey, youngKey] } },
      select: { key: true },
    });
    expect(left.map((row) => row.key)).toEqual([youngKey]);
    // The purged key runs again for real; the young one is still a reuse.
    const rerun = await call("POST", path, {
      user: w.admin,
      idempotencyKey: oldKey,
      body: feeBody(w.student.id),
    });
    expect(rerun.status, rerun.text).toBe(201);
    expect(rerun.body.data.id).not.toBe("stale-replay");
    const reused = await call("POST", path, {
      user: w.admin,
      idempotencyKey: youngKey,
      body: feeBody(w.student.id),
    });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("idempotency_key_reused");
  });

  it("a failed request is not stored: a retry with the same key runs again", async () => {
    const key = randomUUID();
    const body = feeBody(w.other.student.id);
    const failed = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: key,
      body,
    });
    expect(failed.status).toBe(422);
    const okBody = { ...body, studentId: w.student2.id };
    const retry = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: key,
      body: okBody,
    });
    expect(retry.status, retry.text).toBe(201);
  });
});

describe("append-only resources expose no PUT, PATCH or DELETE", () => {
  let fee: Body;
  let attendance: Body;

  beforeAll(async () => {
    fee = await recordFee(w.academy, w.admin, w.student.id);
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    [attendance] = await recordAttendance(w.academy, w.admin, event.id, [
      w.student2.id,
    ]);
  });

  const targets = () => [
    w.academy.path(`/fees/${fee.id}`),
    w.academy.path(`/attendance/${attendance.id}`),
    w.academy.path("/audit-log"),
  ];

  it("the rows are unchanged after PUT, PATCH and DELETE attempts", async () => {
    for (const path of targets()) {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        await call(method, path, {
          user: w.admin,
          body: method === "DELETE" ? undefined : { amount: "1.00" },
        });
      }
    }
    const feeNow = expectStatus(
      await call("GET", w.academy.path(`/fees/${fee.id}`), { user: w.admin }),
      200
    ).data;
    expect(feeNow).toEqual(fee);
    const rowNow = expectStatus(
      await call("GET", w.academy.path(`/attendance/${attendance.id}`), {
        user: w.admin,
      }),
      200
    ).data;
    expect(rowNow.voidedAt).toBeNull();
    expect(rowNow.id).toBe(attendance.id);
  });

  // Was KNOWN DEFECT D1 (fixed in round 3): unsupported methods on /api/v1 paths answer 200 with
  // the app's HTML page instead of a 405 (or 404) JSON error.
  it("FIXED D1: PUT/PATCH/DELETE answer 405 with the JSON envelope", async () => {
    for (const path of targets()) {
      for (const method of ["PUT", "PATCH", "DELETE"]) {
        const reply = await call(method, path, { user: w.admin });
        expect([404, 405], `${method} ${path}`).toContain(reply.status);
        expect(isErrorEnvelope(reply.body)).toBe(true);
      }
    }
  });
});
