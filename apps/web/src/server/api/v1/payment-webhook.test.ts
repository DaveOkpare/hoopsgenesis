import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import {
  addMember,
  cleanup,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import {
  deleteTestFees,
  type ErrorBody,
  type FeeItem,
  genericPaymentEvent,
  genericWebhookRequest,
  insertFee,
  readJson,
} from "./fees.fixtures";
import {
  createPaymentWebhookHandler,
  handlePaymentWebhook,
} from "./payment-webhook";
import { GENERIC_TOLERANCE_SECONDS } from "./payments/generic";
import { createPaymentProviderRegistry } from "./payments/registry";

const SECRET = "test-webhook-secret-0123456789abcdef";
const MS_PER_SECOND = 1000;
const RUN = runId();
const reference = (name: string) => `txn-${name}-${RUN}`;

// Secret injected here; the app reads PAYMENT_WEBHOOK_GENERIC_SECRET instead.
const webhook = createPaymentWebhookHandler(
  createPaymentProviderRegistry((name) =>
    name === "generic" ? SECRET : undefined
  )
);

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let student: TestUser;
let coach: TestUser;
let otherStudent: TestUser;

const deliver = (
  body: unknown,
  options: {
    provider?: string;
    secret?: string;
    at?: Date;
    rawBody?: string;
    handler?: typeof webhook;
  } = {}
) => {
  const provider = options.provider ?? "generic";
  const request = genericWebhookRequest(provider, body, {
    secret: options.secret ?? SECRET,
    at: options.at,
    rawBody: options.rawBody,
  });
  return (options.handler ?? webhook)({ request, params: { provider } });
};

const event = (
  name: string,
  overrides: Partial<Parameters<typeof genericPaymentEvent>[0]> = {}
) =>
  genericPaymentEvent({
    reference: reference(name),
    academyId: academy.id,
    studentId: student.id,
    periodStart: "2026-10-01",
    periodEnd: "2026-10-31",
    ...overrides,
  });

const errorCode = async (response: Response) =>
  (await readJson<ErrorBody>(response)).error.code;

const feeCount = () => db.fee.count({ where: { academyId: academy.id } });

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(),
    createTestAcademy(),
  ]);
  [student, coach, otherStudent] = await Promise.all([
    createTestUser("webhook-student"),
    createTestUser("webhook-coach"),
    createTestUser("webhook-other-student"),
  ]);
  await Promise.all([
    addMember(academy, student, "student"),
    addMember(academy, coach, "coach"),
    addMember(otherAcademy, otherStudent, "student"),
  ]);
});

afterAll(async () => {
  await deleteTestFees([academy, otherAcademy]);
  await cleanup([academy, otherAcademy], [student, coach, otherStudent]);
});

describe("POST /api/v1/webhooks/payments/:provider", () => {
  it("404s for an unknown provider or one without a secret", async () => {
    const unknown = await deliver(event("unknown"), { provider: "stripe" });
    expect(unknown.status).toBe(404);
    expect(await errorCode(unknown)).toBe("not_found");
    expect(
      (await deliver(event("bad-name"), { provider: "Bad Name" })).status
    ).toBe(404);
    // The app's own registry: PAYMENT_WEBHOOK_GENERIC_SECRET is not set in
    // the test env, so the generic provider is off.
    const noSecret = createPaymentWebhookHandler(
      createPaymentProviderRegistry(() => "   ")
    );
    expect(
      (await deliver(event("no-secret"), { handler: noSecret })).status
    ).toBe(404);
    if (!process.env.PAYMENT_WEBHOOK_GENERIC_SECRET) {
      expect(
        (await deliver(event("default"), { handler: handlePaymentWebhook }))
          .status
      ).toBe(404);
    }
    expect(await feeCount()).toBe(0);
  });

  it("401s for a bad signature or a tampered body", async () => {
    const wrongSecret = await deliver(event("wrong-secret"), {
      secret: "another-secret-0123456789abcdef0000",
    });
    expect(wrongSecret.status).toBe(401);
    expect(await errorCode(wrongSecret)).toBe("invalid_signature");

    const original = event("tampered");
    const tampered = {
      ...original,
      data: { ...original.data, amount: "1.00" },
    };
    const tamperedResponse = await deliver(original, {
      rawBody: JSON.stringify(tampered),
    });
    expect(tamperedResponse.status).toBe(401);

    const request = new Request(
      "http://localhost:3001/api/v1/webhooks/payments/generic",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(event("unsigned")),
      }
    );
    const unsigned = await webhook({
      request,
      params: { provider: "generic" },
    });
    expect(unsigned.status).toBe(401);
    expect(await feeCount()).toBe(0);
  });

  it("401s for a stale or far-future timestamp, even when signed", async () => {
    const offsetMs = (GENERIC_TOLERANCE_SECONDS + 60) * MS_PER_SECOND;
    const stale = await deliver(event("stale"), {
      at: new Date(Date.now() - offsetMs),
    });
    expect(stale.status).toBe(401);
    expect(await errorCode(stale)).toBe("stale_timestamp");
    const future = await deliver(event("future"), {
      at: new Date(Date.now() + offsetMs),
    });
    expect(await errorCode(future)).toBe("stale_timestamp");
    expect(await feeCount()).toBe(0);
  });

  it("creates one fee for a valid payment; recorded_by and actor are NULL", async () => {
    const response = await deliver(event("valid"));
    expect(response.status).toBe(201);
    const body = await readJson<{ data: FeeItem; replayed: boolean }>(response);
    expect(body.replayed).toBe(false);
    expect(body.data).toMatchObject({
      academyId: academy.id,
      studentId: student.id,
      amount: "15000.00",
      currency: "NGN",
      periodStart: "2026-10-01",
      periodEnd: "2026-10-31",
      dueDate: "2026-10-01",
      paidAt: "2026-11-20T09:15:00.000Z",
      paymentMethod: "card",
      paymentReference: reference("valid"),
      recordedById: null,
      status: "paid",
    });
    const audit = await db.auditLog.findFirst({
      where: { entityType: "fee", entityId: body.data.id },
    });
    expect(audit).toMatchObject({
      action: "fee.create",
      academyId: academy.id,
      actorId: null,
    });
    expect(await feeCount()).toBe(1);
  });

  it("creates nothing new when the same event is delivered again", async () => {
    const first = await db.fee.findUniqueOrThrow({
      where: { paymentReference: reference("valid") },
    });
    const response = await deliver(event("valid"));
    expect(response.status).toBe(200);
    const body = await readJson<{ data: FeeItem; replayed: boolean }>(response);
    expect(body.replayed).toBe(true);
    expect(body.data.id).toBe(first.id);
    expect(await feeCount()).toBe(1);
    expect(
      await db.auditLog.count({
        where: { entityType: "fee", entityId: first.id },
      })
    ).toBe(1);
  });

  it("handles two concurrent deliveries of one event as one fee", async () => {
    const twin = event("concurrent", {
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });
    const responses = await Promise.all([deliver(twin), deliver(twin)]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      200, 201,
    ]);
    expect(
      await db.fee.count({
        where: { paymentReference: reference("concurrent") },
      })
    ).toBe(1);
  });

  it("refuses a student who is not a student member of that academy", async () => {
    const notMember = await deliver(
      event("not-member", { studentId: otherStudent.id })
    );
    expect(notMember.status).toBe(422);
    expect(await errorCode(notMember)).toBe("student_not_in_academy");
    // The student and academy ids must match each other, not just exist.
    expect(
      (
        await deliver(
          event("wrong-academy", {
            academyId: otherAcademy.id,
            studentId: student.id,
          })
        )
      ).status
    ).toBe(422);
    expect(
      (await deliver(event("coach", { studentId: coach.id }))).status
    ).toBe(422);
    expect(
      (await deliver(event("no-academy", { academyId: `missing-${RUN}` })))
        .status
    ).toBe(422);
    expect(await db.fee.count({ where: { studentId: otherStudent.id } })).toBe(
      0
    );
  });

  it("round-trips money exactly", async () => {
    const response = await deliver(
      event("dime", {
        amount: "0.10",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      })
    );
    expect(response.status).toBe(201);
    const { data } = await readJson<{ data: FeeItem }>(response);
    expect(data.amount).toBe("0.10");
    const stored = await db.fee.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.amount.toFixed(2)).toBe("0.10");
  });

  it("validates the payload: numbers for money, bad dates, extra types", async () => {
    const numeric = event("numeric", {
      periodStart: "2026-07-01",
      periodEnd: "2026-07-31",
    });
    const asNumber = {
      ...numeric,
      data: { ...numeric.data, amount: 15_000 },
    };
    const response = await deliver(asNumber);
    expect(response.status).toBe(400);
    expect(await errorCode(response)).toBe("validation_failed");
    const backwards = await deliver(
      event("backwards", { periodStart: "2026-07-31", periodEnd: "2026-07-01" })
    );
    expect(await errorCode(backwards)).toBe("invalid_period");
    const notJson = await deliver({}, { rawBody: "not json" });
    // Signed over "{}", so the signature fails first.
    expect(notJson.status).toBe(401);
  });

  it("acknowledges and ignores events that are not payments", async () => {
    const response = await deliver(
      event("refund", {
        type: "payment.refunded",
        periodStart: "2026-06-01",
        periodEnd: "2026-06-30",
      })
    );
    expect(response.status).toBe(200);
    const body = await readJson<{ data: { ignored: boolean } }>(response);
    expect(body.data.ignored).toBe(true);
    expect(
      await db.fee.count({ where: { paymentReference: reference("refund") } })
    ).toBe(0);
  });

  it("409s when the period is already paid, and for a reused reference", async () => {
    const manual = await insertFee(academy, student.id, {
      periodStart: "2026-05-01",
      periodEnd: "2026-05-31",
      paidAt: new Date("2026-05-02T00:00:00Z"),
    });
    const taken = await deliver(
      event("taken", { periodStart: "2026-05-01", periodEnd: "2026-05-31" })
    );
    expect(taken.status).toBe(409);
    const body = await readJson<ErrorBody>(taken);
    expect(body.error.code).toBe("fee_period_exists");
    expect(body.error.details).toEqual({ feeId: manual.id });

    const reused = await deliver(
      event("valid", {
        academyId: otherAcademy.id,
        studentId: otherStudent.id,
      })
    );
    expect(reused.status).toBe(409);
    expect(await errorCode(reused)).toBe("payment_reference_conflict");
  });
});
