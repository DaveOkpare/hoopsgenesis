/**
 * Concurrency over HTTP: requests fired at once must leave exactly one row
 * or one change (API endpoints: scan validation, "unique index makes two
 * simultaneous check-ins safe"; schema doc, Rules: Void, Audit).
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { HAS_WEBHOOK_SECRET } from "./helpers/env";
import { type Body, call, type Reply } from "./helpers/http";
import {
  auditRows,
  buildWorld,
  createOpenEvent,
  createRecord,
  expectStatus,
  feeBody,
  getQrToken,
  paymentEvent,
  recordAttendance,
  scan,
  sendWebhook,
  todayIn,
  type World,
} from "./helpers/world";

const PARALLEL = 8;

let w: World;
let today: string;
let token: string;

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
  ({ token } = await getQrToken(w.academy, w.admin));
});

const statuses = (replies: Reply[]): number[] =>
  replies.map((reply) => reply.status).sort();

const codes = (replies: Reply[]): string[] =>
  replies
    .filter((reply) => reply.status >= 400)
    .map((reply) => reply.body?.error?.code);

const times = <T>(count: number, make: () => Promise<T>): Promise<T[]> =>
  Promise.all(Array.from({ length: count }, make));

const liveRows = async (eventId: string, studentId: string) => {
  const reply = await call(
    "GET",
    w.academy.path(`/attendance?eventId=${eventId}&studentId=${studentId}`),
    { user: w.admin }
  );
  return expectStatus(reply, 200).data.filter(
    (row: Body) => row.voidedAt === null
  );
};

describe("parallel requests leave one result", () => {
  it("scans for the same student and session (different keys): one check-in", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const replies = await times(PARALLEL, () =>
      scan(w.student, { token, eventId: event.id, sessionDate: today })
    );
    expect(statuses(replies).filter((status) => status === 201)).toHaveLength(
      1
    );
    expect(codes(replies).every((code) => code === "already_checked_in")).toBe(
      true
    );
    expect(await liveRows(event.id, w.student.id)).toHaveLength(1);
  });

  it("scans with the same Idempotency-Key: one row, every reply the same", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const key = randomUUID();
    const replies = await times(PARALLEL, () =>
      scan(w.student2, { token, eventId: event.id, sessionDate: today }, key)
    );
    expect(new Set(replies.map((reply) => reply.status))).toEqual(
      new Set([201])
    );
    const ids = new Set(replies.map((reply) => reply.body.data.attendance.id));
    expect(ids.size).toBe(1);
    expect(await liveRows(event.id, w.student2.id)).toHaveLength(1);
  });

  it("check-out scans: one check-out, one audit row", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const first = await scan(w.dual, {
      token,
      eventId: event.id,
      sessionDate: today,
    });
    const row = expectStatus(first, 201).data.attendance;
    const replies = await times(PARALLEL, () =>
      scan(w.dual, {
        token,
        eventId: event.id,
        sessionDate: today,
        action: "check_out",
      })
    );
    expect(statuses(replies).filter((status) => status === 200)).toHaveLength(
      1
    );
    expect(codes(replies).every((code) => code === "already_checked_out")).toBe(
      true
    );
    const audit = await auditRows(w.academy, w.admin, {
      entityId: row.id,
      action: "attendance.check_out",
    });
    expect(audit).toHaveLength(1);
  });

  it("manual entries for the same student and session: one row", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const replies = await times(PARALLEL, () =>
      call("POST", w.academy.path("/attendance"), {
        user: w.coach,
        idempotencyKey: true,
        body: {
          eventId: event.id,
          sessionDate: today,
          entries: [{ studentId: w.student.id, status: "present" }],
        },
      })
    );
    expect(statuses(replies).filter((status) => status === 201)).toHaveLength(
      1
    );
    expect(replies.every((reply) => [201, 409].includes(reply.status))).toBe(
      true
    );
    expect(await liveRows(event.id, w.student.id)).toHaveLength(1);
  });

  it("voids of the same attendance row: one void, one audit row", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.admin, event.id, [
      w.student.id,
    ]);
    const replies = await times(PARALLEL, () =>
      call("POST", w.academy.path(`/attendance/${row.id}/void`), {
        user: w.admin,
        body: { reason: "parallel" },
      })
    );
    expect(statuses(replies).filter((status) => status === 200)).toHaveLength(
      1
    );
    expect(codes(replies).every((code) => code === "already_voided")).toBe(
      true
    );
    const audit = await auditRows(w.academy, w.admin, {
      entityId: row.id,
      action: "attendance.void",
    });
    expect(audit).toHaveLength(1);
  });

  it("voids of the same fee: one void, one audit row", async () => {
    const created = await call("POST", w.academy.path("/fees"), {
      user: w.admin,
      idempotencyKey: true,
      body: feeBody(w.student.id),
    });
    const fee = expectStatus(created, 201).data;
    const replies = await times(PARALLEL, () =>
      call("POST", w.academy.path(`/fees/${fee.id}/void`), {
        user: w.admin,
        body: { reason: "parallel" },
      })
    );
    expect(statuses(replies).filter((status) => status === 200)).toHaveLength(
      1
    );
    const audit = await auditRows(w.academy, w.admin, {
      entityId: fee.id,
      action: "fee.void",
    });
    expect(audit).toHaveLength(1);
  });

  it("fee creation for the same student and period (different keys): one fee", async () => {
    const body = feeBody(w.student2.id);
    const replies = await times(PARALLEL, () =>
      call("POST", w.academy.path("/fees"), {
        user: w.admin,
        idempotencyKey: true,
        body,
      })
    );
    expect(statuses(replies).filter((status) => status === 201)).toHaveLength(
      1
    );
    expect(codes(replies).every((code) => code === "fee_period_exists")).toBe(
      true
    );
    const list = await call(
      "GET",
      w.academy.path(
        `/fees?studentId=${w.student2.id}&from=${body.periodStart}&to=${body.periodStart}`
      ),
      { user: w.admin }
    );
    expect(expectStatus(list, 200).data).toHaveLength(1);
  });

  it("verify of the same record by two coaches: one verify, one audit row", async () => {
    const record = await createRecord(
      w.academy,
      w.student,
      w.student.id,
      "academic"
    );
    const replies = await Promise.all(
      Array.from({ length: PARALLEL }, (_, index) =>
        call("POST", w.academy.path(`/records/${record.id}/verify`), {
          user: index % 2 === 0 ? w.coach : w.coach2,
        })
      )
    );
    expect(statuses(replies).filter((status) => status === 200)).toHaveLength(
      1
    );
    expect(codes(replies).every((code) => code === "record_not_pending")).toBe(
      true
    );
    const audit = await auditRows(w.academy, w.admin, { entityId: record.id });
    expect(audit).toHaveLength(1);
  });

  it("ticks of the same attendance row: one audit row", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.admin, event.id, [
      w.student2.id,
    ]);
    const replies = await times(PARALLEL, () =>
      call("POST", w.academy.path(`/attendance/${row.id}/verify`), {
        user: w.coach,
      })
    );
    expect(replies.every((reply) => reply.status === 200)).toBe(true);
    const audit = await auditRows(w.academy, w.admin, {
      entityId: row.id,
      action: "attendance.verify",
    });
    expect(audit).toHaveLength(1);
  });

  it.runIf(HAS_WEBHOOK_SECRET)(
    "webhook deliveries of the same payment: one fee",
    async () => {
      const event = paymentEvent({
        academyId: w.academy.id,
        studentId: w.studentB.id,
        periodStart: "2032-01-01",
        periodEnd: "2032-01-31",
      });
      const replies = await times(PARALLEL, () => sendWebhook(event));
      expect(statuses(replies).filter((status) => status === 201)).toHaveLength(
        1
      );
      expect(replies.every((reply) => [200, 201].includes(reply.status))).toBe(
        true
      );
      expect(new Set(replies.map((reply) => reply.body.data.id)).size).toBe(1);
    }
  );
});
