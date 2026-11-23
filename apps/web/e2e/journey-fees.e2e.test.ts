/**
 * Fee journey (User stories: AO-4, AO-5, AO-6, CO-7, ST-5, "Paying a fee";
 * API endpoints: Fees, payment webhook).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { HAS_WEBHOOK_SECRET } from "./helpers/env";
import { type Body, call, type User } from "./helpers/http";
import {
  auditRows,
  buildWorld,
  expectStatus,
  feeBody,
  paymentEvent,
  recordFee,
  sendWebhook,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;
let today: string;

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
});

const outstandingIds = async (user: User, query = ""): Promise<string[]> => {
  const reply = await call(
    "GET",
    w.academy.path(`/fees/outstanding?limit=200${query}`),
    { user }
  );
  const body = expectStatus(reply, 200);
  expect(body.on).toBe(today);
  return body.data.map((row: Body) => row.student.id);
};

const mySummary = async (user: User): Promise<Body> => {
  const reply = await call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
    user,
  });
  return expectStatus(reply, 200);
};

describe("record -> outstanding drops -> void -> outstanding again -> webhook pays", () => {
  let fee: Body;
  const period = () => ({ periodStart: today, periodEnd: today });

  it("the student starts on the outstanding list (admin and coach)", async () => {
    expect(await outstandingIds(w.admin)).toContain(w.student.id);
    expect(await outstandingIds(w.coach)).toContain(w.student.id);
    expect((await mySummary(w.student)).summary.isOutstanding).toBe(true);
  });

  it("admin records a cash payment covering today (AO-4)", async () => {
    fee = await recordFee(w.academy, w.admin, w.student.id, {
      ...period(),
      amount: "15000.50",
      paymentMethod: "cash",
    });
    expect(fee.amount).toBe("15000.50");
    expect(fee.currency).toBe("NGN");
    expect(fee.status).toBe("paid");
    expect(fee.recordedById).toBe(w.admin.id);
  });

  it("a second payment for the same period is caught with a link (409)", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student.id, period()),
    });
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("fee_period_exists");
    expect(reply.body.error.details.feeId).toBe(fee.id);
  });

  it("the student drops off the outstanding lists (AO-5, CO-7)", async () => {
    expect(await outstandingIds(w.admin)).not.toContain(w.student.id);
    expect(await outstandingIds(w.coach, `&teamId=${w.teamA}`)).not.toContain(
      w.student.id
    );
    const mine = await mySummary(w.student);
    expect(mine.summary.isOutstanding).toBe(false);
    expect(mine.summary.paidThrough).toBe(today);
    expect(mine.data.map((row: Body) => row.id)).toContain(fee.id);
  });

  it("the coach reads fees but cannot record or void them", async () => {
    const list = await call("GET", w.academy.path("/fees"), { user: w.coach });
    expect(expectStatus(list, 200).data.map((row: Body) => row.id)).toContain(
      fee.id
    );
    const voided = await call("POST", w.academy.path(`/fees/${fee.id}/void`), {
      user: w.coach,
      body: { reason: "no" },
    });
    expect(voided.status).toBe(403);
  });

  it("admin voids it with a reason; the student is outstanding again (AO-6)", async () => {
    const reply = await call("POST", w.academy.path(`/fees/${fee.id}/void`), {
      user: w.admin,
      body: { reason: "Counterfeit note" },
    });
    const row = expectStatus(reply, 200).data;
    expect(row.status).toBe("voided");
    expect(row.voidedById).toBe(w.admin.id);
    expect(await outstandingIds(w.admin)).toContain(w.student.id);
    const again = await call("POST", w.academy.path(`/fees/${fee.id}/void`), {
      user: w.admin,
      body: { reason: "twice" },
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_voided");
    const mine = await mySummary(w.student);
    expect(mine.summary.isOutstanding).toBe(true);
    // The voided row stays in the history, marked voided.
    const kept = mine.data.find((item: Body) => item.id === fee.id);
    expect(kept?.status).toBe("voided");
  });

  it.runIf(HAS_WEBHOOK_SECRET)(
    "a signed webhook payment records the fee; the student drops off again",
    async () => {
      const event = paymentEvent({
        academyId: w.academy.id,
        studentId: w.student.id,
        ...period(),
        amount: "15000.00",
      });
      const reply = await sendWebhook(event);
      const body = expectStatus(reply, 201);
      expect(body.replayed).toBe(false);
      expect(body.data.recordedById).toBeNull();
      expect(body.data.paymentReference).toBe(event.data.reference);
      expect(await outstandingIds(w.coach)).not.toContain(w.student.id);

      // The provider retries: same reference, nothing new.
      const retry = await sendWebhook(event);
      const replay = expectStatus(retry, 200);
      expect(replay.replayed).toBe(true);
      expect(replay.data.id).toBe(body.data.id);

      // Cash for the same period on top of it is refused.
      const cash = await call("POST", w.academy.path("/fees"), {
        user: w.admin,
        idempotencyKey: true,
        body: feeBody(w.student.id, period()),
      });
      expect(cash.status).toBe(409);

      const audit = await auditRows(w.academy, w.admin, {
        entityId: body.data.id,
      });
      expect(audit).toHaveLength(1);
      expect(audit[0].action).toBe("fee.create");
      expect(audit[0].actorId).toBeNull();
    }
  );

  it("the manual create and the void are in the audit log with the admin as actor", async () => {
    const rows = await auditRows(w.academy, w.admin, { entityId: fee.id });
    const actions = rows.map((row: Body) => row.action).sort();
    expect(actions).toEqual(["fee.create", "fee.void"]);
    expect(rows.every((row: Body) => row.actorId === w.admin.id)).toBe(true);
    expect(rows.find((row: Body) => row.action === "fee.void")?.reason).toBe(
      "Counterfeit note"
    );
  });

  it("the dashboard counts outstanding students for this academy only", async () => {
    const reply = await call("GET", w.academy.path("/dashboard"), {
      user: w.admin,
    });
    const { data } = expectStatus(reply, 200);
    const outstanding = await outstandingIds(w.admin);
    expect(data.fees.outstandingStudents).toBe(outstanding.length);
    expect(data.today).toBe(today);
    expect(data.timezone).toBe(w.academy.timezone);
  });
});

describe.runIf(HAS_WEBHOOK_SECRET)("webhook refusals", () => {
  const base = () =>
    paymentEvent({
      academyId: w.academy.id,
      studentId: w.student2.id,
      periodStart: "2030-01-01",
      periodEnd: "2030-01-31",
    });

  it("wrong secret -> 401 invalid_signature", async () => {
    const reply = await sendWebhook(base(), {
      secret: "x".repeat(40),
    });
    expect(reply.status).toBe(401);
    expect(reply.body.error.code).toBe("invalid_signature");
  });

  it("a timestamp 10 minutes old -> 401 stale_timestamp", async () => {
    const reply = await sendWebhook(base(), {
      timestamp: Math.floor(Date.now() / 1000) - 600,
    });
    expect(reply.status).toBe(401);
    expect(reply.body.error.code).toBe("stale_timestamp");
  });

  it("unknown provider -> 404", async () => {
    const reply = await sendWebhook(base(), { provider: "paypal" });
    expect(reply.status).toBe(404);
  });

  it("a student of another academy -> 422, nothing recorded", async () => {
    const reply = await sendWebhook(
      paymentEvent({
        academyId: w.academy.id,
        studentId: w.other.student.id,
        periodStart: "2030-02-01",
        periodEnd: "2030-02-28",
      })
    );
    expect(reply.status).toBe(422);
  });

  it("an event type it does not handle is acknowledged and ignored", async () => {
    const reply = await sendWebhook({ type: "payment.refunded", data: {} });
    expect(reply.status).toBe(200);
    expect(reply.body.data.ignored).toBe(true);
  });

  it("a reused reference for a different student -> 409", async () => {
    const first = base();
    expect((await sendWebhook(first)).status).toBe(201);
    const second = paymentEvent({
      academyId: w.academy.id,
      studentId: w.studentB.id,
      periodStart: "2030-03-01",
      periodEnd: "2030-03-31",
      reference: first.data.reference,
    });
    const reply = await sendWebhook(second);
    expect(reply.status).toBe(409);
  });
});

describe("fee input rules", () => {
  it("a student who is not in this academy -> 422", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.other.student.id),
    });
    expect(reply.status).toBe(422);
  });

  it("periodEnd before periodStart -> 400", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student2.id, {
        periodStart: "2031-05-02",
        periodEnd: "2031-05-01",
      }),
    });
    expect(reply.status).toBe(400);
  });

  it("recordedById in the body is rejected, not trusted", async () => {
    const reply = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student2.id, { recordedById: w.coach.id }),
    });
    expect(reply.status).toBe(400);
  });
});
