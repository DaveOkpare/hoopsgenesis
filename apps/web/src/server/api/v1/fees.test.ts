import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import { IDEMPOTENT_REPLAY_HEADER } from "../idempotency";
import {
  addMember,
  apiRequest,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { addDays, todayInTimeZone } from "../time";
import {
  getFee,
  listFees,
  listMyFees,
  listOutstandingFees,
  recordFee,
  voidFee,
} from "./fees";
import {
  deleteTestFees,
  type ErrorBody,
  type FeeItem,
  insertFee,
  newIdempotencyKey,
  readJson,
} from "./fees.fixtures";
import { deriveFeeStatus } from "./fees-core";

interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

interface OutstandingItem {
  currentFee: {
    description: string;
    dueDate: string;
    feeId: string;
    periodEnd: string;
    periodStart: string;
  } | null;
  daysOverdue: number | null;
  lastPayment: { feeId: string; periodEnd: string; amount: string } | null;
  overdueSince: string | null;
  student: { id: string; name: string };
  teams: { id: string; name: string }[];
}

const TIME_ZONE = "Africa/Lagos";
const NOVEMBER = { periodStart: "2026-11-01", periodEnd: "2026-11-30" };

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coach: TestUser;
let s1: TestUser;
let s2: TestUser;
let s3: TestUser;
let outsider: TestUser;
let otherStudent: TestUser;
let otherAcademyAdmin: TestUser;
let team1: string;
let team2: string;
let otherFeeId: string;

const feesPath = (academyId: string, rest = "") =>
  `/api/v1/academies/${academyId}/fees${rest}`;

const record = (
  user: TestUser | undefined,
  body: unknown,
  options: { key?: string | null; academyId?: string } = {}
) => {
  const academyId = options.academyId ?? academy.id;
  const key = options.key === undefined ? newIdempotencyKey() : options.key;
  return recordFee({
    request: apiRequest(feesPath(academyId), {
      user,
      method: "POST",
      body,
      headers: key === null ? {} : { "idempotency-key": key },
    }),
    params: { academyId },
  });
};

const list = (user: TestUser | undefined, query = "", academyId?: string) => {
  const id = academyId ?? academy.id;
  return listFees({
    request: apiRequest(feesPath(id, query), { user }),
    params: { academyId: id },
  });
};

const getOne = (user: TestUser | undefined, id: string, academyId?: string) => {
  const academyIdValue = academyId ?? academy.id;
  return getFee({
    request: apiRequest(feesPath(academyIdValue, `/${id}`), { user }),
    params: { academyId: academyIdValue, id },
  });
};

const voidOne = (
  user: TestUser | undefined,
  id: string,
  body: unknown,
  academyId?: string
) => {
  const academyIdValue = academyId ?? academy.id;
  return voidFee({
    request: apiRequest(feesPath(academyIdValue, `/${id}/void`), {
      user,
      method: "POST",
      body,
    }),
    params: { academyId: academyIdValue, id },
  });
};

const outstanding = (user: TestUser | undefined, query = "") =>
  listOutstandingFees({
    request: apiRequest(feesPath(academy.id, `/outstanding${query}`), { user }),
    params: { academyId: academy.id },
  });

const myFees = (user: TestUser | undefined, query: string) =>
  listMyFees({
    request: apiRequest(`/api/v1/me/fees${query}`, { user }),
    params: {},
  });

const paymentBody = (
  studentId: string,
  overrides: Record<string, unknown> = {}
) => ({
  studentId,
  description: "Nov 2026 tuition",
  ...NOVEMBER,
  amount: "15000.00",
  currency: "NGN",
  paidAt: "2026-11-05T10:00:00Z",
  paymentMethod: "cash",
  ...overrides,
});

const errorCode = async (response: Response) =>
  (await readJson<ErrorBody>(response)).error.code;

const idsOf = (page: Page<FeeItem>) => page.data.map((fee) => fee.id);

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TIME_ZONE),
    createTestAcademy(TIME_ZONE),
  ]);
  [
    leadAdmin,
    admin,
    coach,
    s1,
    s2,
    s3,
    outsider,
    otherStudent,
    otherAcademyAdmin,
  ] = await Promise.all([
    createTestUser("fee-leadAdmin"),
    createTestUser("fee-admin"),
    createTestUser("fee-coach"),
    createTestUser("fee-s1"),
    createTestUser("fee-s2"),
    createTestUser("fee-s3"),
    createTestUser("fee-outsider"),
    createTestUser("fee-other-student"),
    createTestUser("fee-other-leadAdmin"),
  ]);
  await Promise.all([
    addMember(academy, leadAdmin, "admin"),
    addMember(academy, admin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, s1, "student"),
    addMember(academy, s2, "student"),
    addMember(academy, s3, "student"),
    addMember(otherAcademy, otherStudent, "student"),
    addMember(otherAcademy, otherAcademyAdmin, "admin"),
  ]);
  team1 = await createTeam(academy, [coach, s1, s3]);
  team2 = await createTeam(academy, [s2]);
  const otherFee = await insertFee(otherAcademy, otherStudent.id, {
    ...NOVEMBER,
    paidAt: new Date("2026-11-02T00:00:00Z"),
  });
  otherFeeId = otherFee.id;
});

afterAll(async () => {
  await deleteTestFees([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [
      leadAdmin,
      admin,
      coach,
      s1,
      s2,
      s3,
      outsider,
      otherStudent,
      otherAcademyAdmin,
    ]
  );
});

describe("deriveFeeStatus", () => {
  const base = {
    voidedAt: null,
    paidAt: null,
    dueDate: new Date("2026-11-10T00:00:00Z"),
  };
  it("derives each status", () => {
    expect(deriveFeeStatus(base, "2026-11-10")).toBe("unpaid");
    expect(deriveFeeStatus(base, "2026-11-11")).toBe("overdue");
    expect(deriveFeeStatus({ ...base, paidAt: new Date() }, "2026-12-01")).toBe(
      "paid"
    );
    expect(
      deriveFeeStatus(
        { ...base, paidAt: new Date(), voidedAt: new Date() },
        "2026-12-01"
      )
    ).toBe("voided");
  });
});

describe("POST /fees, void and record again", () => {
  let firstId: string;

  it("refuses callers in check order: 401, 404, 403", async () => {
    expect((await record(undefined, paymentBody(s1.id))).status).toBe(401);
    expect((await record(outsider, paymentBody(s1.id))).status).toBe(404);
    // Admin of this academy, not a member of the other one.
    expect(
      (
        await record(leadAdmin, paymentBody(otherStudent.id), {
          academyId: otherAcademy.id,
        })
      ).status
    ).toBe(404);
    const coachResponse = await record(coach, paymentBody(s1.id));
    expect(coachResponse.status).toBe(403);
    expect(await errorCode(coachResponse)).toBe("forbidden");
    expect((await record(s1, paymentBody(s1.id))).status).toBe(403);
  });

  it("validates strictly", async () => {
    const noKey = await record(leadAdmin, paymentBody(s1.id), { key: null });
    expect(noKey.status).toBe(400);
    expect(await errorCode(noKey)).toBe("idempotency_key_required");

    const numberAmount = await record(
      leadAdmin,
      paymentBody(s1.id, { amount: 15_000 })
    );
    expect(numberAmount.status).toBe(400);
    const body = await readJson<ErrorBody>(numberAmount);
    expect(body.error.code).toBe("validation_failed");
    expect(body.error.details?.issues).toBeDefined();

    expect(
      (
        await record(
          leadAdmin,
          paymentBody(s1.id, { recordedById: leadAdmin.id })
        )
      ).status
    ).toBe(400);
    expect(
      (await record(leadAdmin, paymentBody(s1.id, { amount: "0.00" }))).status
    ).toBe(400);
    expect(
      (await record(leadAdmin, paymentBody(s1.id, { amount: "1.234" }))).status
    ).toBe(400);
    const { paidAt: _paidAt, ...withoutPaidAt } = paymentBody(s1.id);
    expect((await record(leadAdmin, withoutPaidAt)).status).toBe(400);
    const backwards = await record(
      leadAdmin,
      paymentBody(s1.id, { periodStart: "2026-11-30", periodEnd: "2026-11-01" })
    );
    expect(backwards.status).toBe(400);
    expect(await errorCode(backwards)).toBe("invalid_period");
    const future = await record(
      leadAdmin,
      paymentBody(s1.id, {
        paidAt: new Date(Date.now() + 86_400_000).toISOString(),
      })
    );
    expect(await errorCode(future)).toBe("paid_at_in_future");
  });

  it("refuses a student who is not a student member of the academy", async () => {
    const elsewhere = await record(leadAdmin, paymentBody(otherStudent.id));
    expect(elsewhere.status).toBe(422);
    expect(await errorCode(elsewhere)).toBe("student_not_in_academy");
    // A member, but not a student.
    expect(
      await errorCode(await record(leadAdmin, paymentBody(coach.id)))
    ).toBe("student_not_in_academy");
  });

  it("records a payment as leadAdmin (201), recorded_by from the session", async () => {
    const response = await record(leadAdmin, paymentBody(s1.id));
    expect(response.status).toBe(201);
    const { data } = await readJson<{ data: FeeItem }>(response);
    firstId = data.id;
    expect(data).toMatchObject({
      academyId: academy.id,
      studentId: s1.id,
      amount: "15000.00",
      currency: "NGN",
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      dueDate: "2026-11-01",
      paidAt: "2026-11-05T10:00:00.000Z",
      status: "paid",
      recordedById: leadAdmin.id,
      voidedAt: null,
    });
  });

  it("records as admin and round-trips money exactly", async () => {
    const response = await record(
      admin,
      paymentBody(s2.id, { amount: "0.10", dueDate: "2026-11-07" })
    );
    expect(response.status).toBe(201);
    const { data } = await readJson<{ data: FeeItem }>(response);
    expect(data.amount).toBe("0.10");
    expect(data.dueDate).toBe("2026-11-07");
    const stored = await db.fee.findUniqueOrThrow({ where: { id: data.id } });
    expect(stored.amount.toFixed(2)).toBe("0.10");
    const read = await readJson<{ data: FeeItem }>(
      await getOne(leadAdmin, data.id)
    );
    expect(read.data.amount).toBe("0.10");
  });

  it("replays the first result for the same Idempotency-Key", async () => {
    const key = newIdempotencyKey();
    const body = paymentBody(s3.id, { amount: "12345.67" });
    const first = await record(leadAdmin, body, { key });
    const second = await record(leadAdmin, body, { key });
    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(second.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    const [a, b] = await Promise.all([
      readJson<{ data: FeeItem }>(first),
      readJson<{ data: FeeItem }>(second),
    ]);
    expect(b.data.id).toBe(a.data.id);
    expect(b.data.amount).toBe("12345.67");
    expect(
      await db.fee.count({ where: { academyId: academy.id, studentId: s3.id } })
    ).toBe(1);
    const reused = await record(
      leadAdmin,
      { ...body, amount: "1.00" },
      { key }
    );
    expect(reused.status).toBe(409);
    expect(await errorCode(reused)).toBe("idempotency_key_reused");
  });

  it("refuses a second live fee for the same period with the existing id", async () => {
    const response = await record(
      leadAdmin,
      paymentBody(s1.id, { amount: "500.00" })
    );
    expect(response.status).toBe(409);
    const body = await readJson<ErrorBody>(response);
    expect(body.error.code).toBe("fee_period_exists");
    expect(body.error.details).toEqual({ feeId: firstId });
  });

  it("refuses void for coach, student, other academy and unknown id", async () => {
    expect((await voidOne(undefined, firstId, { reason: "x" })).status).toBe(
      401
    );
    expect((await voidOne(outsider, firstId, { reason: "x" })).status).toBe(
      404
    );
    expect((await voidOne(coach, firstId, { reason: "x" })).status).toBe(403);
    expect((await voidOne(s1, firstId, { reason: "x" })).status).toBe(403);
    expect((await voidOne(leadAdmin, otherFeeId, { reason: "x" })).status).toBe(
      404
    );
    expect(
      (await voidOne(leadAdmin, otherFeeId, { reason: "x" }, otherAcademy.id))
        .status
    ).toBe(404);
    expect(
      (await voidOne(leadAdmin, "no-such-fee", { reason: "x" })).status
    ).toBe(404);
    expect((await voidOne(leadAdmin, firstId, {})).status).toBe(400);
    expect((await voidOne(leadAdmin, firstId, { reason: "   " })).status).toBe(
      400
    );
  });

  it("voids once, audited; a second void is 409", async () => {
    const response = await voidOne(admin, firstId, { reason: "Wrong amount" });
    expect(response.status).toBe(200);
    const { data } = await readJson<{ data: FeeItem }>(response);
    expect(data).toMatchObject({
      status: "voided",
      voidedById: admin.id,
      voidedBy: { id: admin.id, name: "fee-admin" },
      recordedBy: { id: expect.any(String), name: expect.any(String) },
      voidReason: "Wrong amount",
    });
    const audit = await db.auditLog.findFirst({
      where: { entityType: "fee", entityId: firstId, action: "fee.void" },
    });
    expect(audit).toMatchObject({
      actorId: admin.id,
      academyId: academy.id,
      reason: "Wrong amount",
    });
    const again = await voidOne(leadAdmin, firstId, { reason: "Twice" });
    expect(again.status).toBe(409);
    expect(await errorCode(again)).toBe("already_voided");
  });

  it("records the same period again after the void", async () => {
    const response = await record(
      leadAdmin,
      paymentBody(s1.id, { amount: "14000.00" })
    );
    expect(response.status).toBe(201);
    const { data } = await readJson<{ data: FeeItem }>(response);
    expect(data.id).not.toBe(firstId);
    expect(data.status).toBe("paid");
  });
});

describe("GET /fees and /fees/:id", () => {
  let s1Ids: string[];
  let s2Ids: string[];

  beforeAll(async () => {
    const rows = await db.fee.findMany({
      where: { academyId: academy.id },
      select: { id: true, studentId: true },
    });
    s1Ids = rows.filter((row) => row.studentId === s1.id).map((row) => row.id);
    s2Ids = rows.filter((row) => row.studentId === s2.id).map((row) => row.id);
  });

  it("refuses 401 and 404", async () => {
    expect((await list(undefined)).status).toBe(401);
    expect((await list(outsider)).status).toBe(404);
    expect((await list(leadAdmin, "", otherAcademy.id)).status).toBe(404);
  });

  it("academy admins see the whole academy, never another academy", async () => {
    const pages = await Promise.all(
      [leadAdmin, admin].map(async (user) =>
        readJson<Page<FeeItem>>(await list(user))
      )
    );
    for (const page of pages) {
      expect(page.data.length).toBe(4);
      expect(idsOf(page)).not.toContain(otherFeeId);
      expect(page.data.every((fee) => fee.academyId === academy.id)).toBe(true);
    }
  });

  it("keeps voided fees visible with their status", async () => {
    const page = await readJson<Page<FeeItem>>(
      await list(leadAdmin, `?studentId=${s1.id}`)
    );
    expect(page.data.map((fee) => fee.status).sort()).toEqual([
      "paid",
      "voided",
    ]);
  });

  it("coach sees only own teams' students", async () => {
    const page = await readJson<Page<FeeItem>>(await list(coach));
    expect(
      page.data.every((fee) => [s1.id, s3.id].includes(fee.studentId))
    ).toBe(true);
    expect(page.data.length).toBe(3);
    const s2Page = await readJson<Page<FeeItem>>(
      await list(coach, `?studentId=${s2.id}`)
    );
    expect(s2Page.data).toEqual([]);
    expect((await list(coach, `?teamId=${team2}`)).status).toBe(404);
    const team1Page = await readJson<Page<FeeItem>>(
      await list(coach, `?teamId=${team1}`)
    );
    expect(team1Page.data.length).toBe(3);
  });

  it("student sees only their own rows", async () => {
    const page = await readJson<Page<FeeItem>>(await list(s2));
    expect(idsOf(page)).toEqual(s2Ids);
    const others = await readJson<Page<FeeItem>>(
      await list(s2, `?studentId=${s1.id}`)
    );
    expect(others.data).toEqual([]);
  });

  it("filters by team and period overlap, and checks ranges", async () => {
    const team2Page = await readJson<Page<FeeItem>>(
      await list(leadAdmin, `?teamId=${team2}`)
    );
    expect(idsOf(team2Page)).toEqual(s2Ids);
    const overlapping = await readJson<Page<FeeItem>>(
      await list(leadAdmin, "?from=2026-11-15&to=2026-11-15")
    );
    expect(overlapping.data.length).toBe(4);
    const before = await readJson<Page<FeeItem>>(
      await list(leadAdmin, "?to=2026-10-31")
    );
    expect(before.data).toEqual([]);
    const after = await readJson<Page<FeeItem>>(
      await list(leadAdmin, "?from=2026-12-01")
    );
    expect(after.data).toEqual([]);
    const backwards = await list(leadAdmin, "?from=2026-12-01&to=2026-11-01");
    expect(backwards.status).toBe(400);
    expect((await list(leadAdmin, "?status=paid")).status).toBe(400);
    expect((await list(leadAdmin, "?teamId=no-such-team")).status).toBe(404);
  });

  it("paginates with a cursor", async () => {
    const first = await readJson<Page<FeeItem>>(
      await list(leadAdmin, "?limit=3")
    );
    expect(first.data.length).toBe(3);
    expect(first.nextCursor).not.toBeNull();
    const second = await readJson<Page<FeeItem>>(
      await list(leadAdmin, `?limit=3&cursor=${first.nextCursor}`)
    );
    expect(second.data.length).toBe(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...idsOf(first), ...idsOf(second)]).size).toBe(4);
    expect((await list(leadAdmin, "?cursor=garbage")).status).toBe(400);
  });

  it("GET /fees/:id is scoped the same way", async () => {
    const [s1Fee] = s1Ids;
    const [s2Fee] = s2Ids;
    expect((await getOne(undefined, s1Fee)).status).toBe(401);
    expect((await getOne(outsider, s1Fee)).status).toBe(404);
    expect((await getOne(leadAdmin, s1Fee)).status).toBe(200);
    expect((await getOne(coach, s1Fee)).status).toBe(200);
    expect((await getOne(coach, s2Fee)).status).toBe(404);
    expect((await getOne(s2, s2Fee)).status).toBe(200);
    expect((await getOne(s2, s1Fee)).status).toBe(404);
    expect((await getOne(leadAdmin, otherFeeId)).status).toBe(404);
    const missing = await getOne(leadAdmin, "no-such-fee");
    expect(missing.status).toBe(404);
    expect(await errorCode(missing)).toBe("not_found");
  });
});

describe("derived status", () => {
  it("returns paid, unpaid, overdue and voided", async () => {
    const today = todayInTimeZone(TIME_ZONE);
    const unpaid = await insertFee(academy, s3.id, {
      periodStart: "2030-01-01",
      periodEnd: "2030-01-31",
      dueDate: addDays(today, 3),
    });
    const overdue = await insertFee(academy, s3.id, {
      periodStart: "2030-02-01",
      periodEnd: "2030-02-28",
      dueDate: addDays(today, -1),
    });
    const voided = await insertFee(academy, s3.id, {
      periodStart: "2030-03-01",
      periodEnd: "2030-03-31",
    });
    expect(
      (await voidOne(leadAdmin, voided.id, { reason: "Test" })).status
    ).toBe(200);
    const statusOf = async (id: string) =>
      (await readJson<{ data: FeeItem }>(await getOne(leadAdmin, id))).data
        .status;
    expect(await statusOf(unpaid.id)).toBe("unpaid");
    expect(await statusOf(overdue.id)).toBe("overdue");
    expect(await statusOf(voided.id)).toBe("voided");
    const paid = await readJson<Page<FeeItem>>(
      await list(leadAdmin, `?studentId=${s3.id}&to=2026-12-31`)
    );
    expect(paid.data.map((fee) => fee.status)).toEqual(["paid"]);
  });
});

describe("GET /fees/outstanding", () => {
  // March 2025, a month nothing else in this file touches.
  const ON = "2025-03-15";
  const MARCH = { periodStart: "2025-03-01", periodEnd: "2025-03-31" };
  let s1Paid: string;
  let s3Bill: string;

  const studentsOn = async (user: TestUser, query = "") => {
    const response = await outstanding(user, `?on=${ON}${query}`);
    expect(response.status).toBe(200);
    const body = await readJson<Page<OutstandingItem> & { on: string }>(
      response
    );
    expect(body.on).toBe(ON);
    return body;
  };
  const idsFor = async (user: TestUser, query = "") =>
    (await studentsOn(user, query)).data.map((item) => item.student.id).sort();

  beforeAll(async () => {
    // s1 paid February; s3 has an unpaid March bill due 5 March.
    await insertFee(academy, s1.id, {
      periodStart: "2025-02-01",
      periodEnd: "2025-02-28",
      paidAt: new Date("2025-02-03T09:00:00Z"),
      amount: "15000.00",
    });
    const bill = await insertFee(academy, s3.id, {
      ...MARCH,
      dueDate: "2025-03-05",
    });
    s3Bill = bill.id;
  });

  it("refuses 401, 404, 403 for students, and bad input", async () => {
    expect((await outstanding(undefined)).status).toBe(401);
    expect((await outstanding(outsider)).status).toBe(404);
    expect((await outstanding(s1)).status).toBe(403);
    expect((await outstanding(leadAdmin, "?on=2027-02-30")).status).toBe(400);
    expect((await outstanding(leadAdmin, "?extra=1")).status).toBe(400);
    expect((await outstanding(coach, `?teamId=${team2}`)).status).toBe(404);
  });

  it("before payment: leadAdmin sees all students, coach only own teams", async () => {
    expect(await idsFor(leadAdmin)).toEqual([s1.id, s2.id, s3.id].sort());
    expect(await idsFor(admin)).toEqual([s1.id, s2.id, s3.id].sort());
    expect(await idsFor(coach)).toEqual([s1.id, s3.id].sort());
    expect(await idsFor(leadAdmin, `&teamId=${team2}`)).toEqual([s2.id]);
    expect(await idsFor(coach, `&teamId=${team1}`)).toEqual(
      [s1.id, s3.id].sort()
    );
  });

  it("includes last payment, days overdue and teams", async () => {
    const { data } = await studentsOn(leadAdmin);
    const byId = new Map(data.map((item) => [item.student.id, item]));
    const first = byId.get(s1.id);
    expect(first?.lastPayment).toMatchObject({
      periodEnd: "2025-02-28",
      amount: "15000.00",
    });
    expect(first?.overdueSince).toBe("2025-03-01");
    expect(first?.daysOverdue).toBe(14);
    expect(first?.teams.map((team) => team.id)).toEqual([team1]);
    const third = byId.get(s3.id);
    expect(third?.currentFee).toEqual({
      feeId: s3Bill,
      description: "Test fee 2025-03-01",
      periodStart: "2025-03-01",
      periodEnd: "2025-03-31",
      dueDate: "2025-03-05",
      amount: "100.00",
      currency: "NGN",
    });
    expect(third?.daysOverdue).toBe(10);
    // s2's only payment (November 2026) is after `on`, and there is no bill.
    const second = byId.get(s2.id);
    expect(second?.lastPayment).toBeNull();
    expect(second?.overdueSince).toBeNull();
    expect(second?.daysOverdue).toBeNull();
  });

  it("after payment the student drops out; after void they are back", async () => {
    const response = await record(
      leadAdmin,
      paymentBody(s1.id, {
        ...MARCH,
        paidAt: "2025-03-10T08:00:00Z",
        description: "Mar 2025",
      })
    );
    expect(response.status).toBe(201);
    s1Paid = (await readJson<{ data: FeeItem }>(response)).data.id;
    expect(await idsFor(leadAdmin)).toEqual([s2.id, s3.id].sort());
    expect(await idsFor(coach)).toEqual([s3.id]);

    expect(
      (await voidOne(leadAdmin, s1Paid, { reason: "Bounced" })).status
    ).toBe(200);
    expect(await idsFor(leadAdmin)).toEqual([s1.id, s2.id, s3.id].sort());
    expect(await idsFor(coach)).toEqual([s1.id, s3.id].sort());
  });

  it("paginates by student", async () => {
    const first = await studentsOn(leadAdmin, "&limit=2");
    expect(first.data.length).toBe(2);
    expect(first.nextCursor).not.toBeNull();
    const second = await studentsOn(
      leadAdmin,
      `&limit=2&cursor=${first.nextCursor}`
    );
    expect(second.data.length).toBe(1);
    expect(second.nextCursor).toBeNull();
  });

  it("defaults on to today in the academy's time zone", async () => {
    const response = await outstanding(leadAdmin);
    const body = await readJson<{ on: string }>(response);
    expect(body.on).toBe(todayInTimeZone(TIME_ZONE));
  });
});

describe("GET /api/v1/me/fees", () => {
  it("refuses 401, 400 without academyId, 404 non-members, 403 non-students", async () => {
    expect((await myFees(undefined, `?academyId=${academy.id}`)).status).toBe(
      401
    );
    expect((await myFees(s1, "")).status).toBe(400);
    expect((await myFees(outsider, `?academyId=${academy.id}`)).status).toBe(
      404
    );
    // Non-member with an unknown key still gets 404, not 400.
    expect(
      (await myFees(outsider, `?academyId=${academy.id}&x=1`)).status
    ).toBe(404);
    expect((await myFees(s1, `?academyId=${otherAcademy.id}`)).status).toBe(
      404
    );
    const coachResponse = await myFees(coach, `?academyId=${academy.id}`);
    expect(coachResponse.status).toBe(403);
    expect(await errorCode(coachResponse)).toBe("not_a_student");
    expect((await myFees(s1, `?academyId=${academy.id}&x=1`)).status).toBe(400);
  });

  it("returns only the student's own rows, with a summary", async () => {
    const response = await myFees(s2, `?academyId=${academy.id}`);
    expect(response.status).toBe(200);
    const body = await readJson<
      Page<FeeItem> & {
        summary: {
          paidThrough: string | null;
          isOutstanding: boolean;
          on: string;
        };
      }
    >(response);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((fee) => fee.studentId === s2.id)).toBe(true);
    expect(body.summary.paidThrough).toBe("2026-11-30");
    expect(body.summary.on).toBe(todayInTimeZone(TIME_ZONE));
    expect(typeof body.summary.isOutstanding).toBe("boolean");
  });

  it("filters by period and paginates", async () => {
    const page = await readJson<Page<FeeItem>>(
      await myFees(s1, `?academyId=${academy.id}&limit=1`)
    );
    expect(page.data.length).toBe(1);
    expect(page.nextCursor).not.toBeNull();
    const march = await readJson<Page<FeeItem>>(
      await myFees(s1, `?academyId=${academy.id}&from=2025-03-01&to=2025-03-31`)
    );
    expect(march.data.map((fee) => fee.status)).toEqual(["voided"]);
  });
});

describe("names and the current fee in GET /api/v1/me/fees", () => {
  let ownAcademy: TestAcademy;
  let ownAdmin: TestUser;
  let pupil: TestUser;
  const today = todayInTimeZone(TIME_ZONE);

  beforeAll(async () => {
    ownAcademy = await createTestAcademy(TIME_ZONE);
    [ownAdmin, pupil] = await Promise.all([
      createTestUser("fee-admin"),
      createTestUser("pupil"),
    ]);
    await addMember(ownAcademy, ownAdmin, "admin");
    await addMember(ownAcademy, pupil, "student");
  });

  afterAll(async () => {
    await deleteTestFees([ownAcademy]);
    await cleanup([ownAcademy], [ownAdmin, pupil]);
  });

  it("summary.currentFee names the billed fee: description and period (ST-5)", async () => {
    const periodStart = addDays(today, -10);
    const periodEnd = addDays(today, 19);
    const bill = await insertFee(ownAcademy, pupil.id, {
      periodStart,
      periodEnd,
      dueDate: addDays(today, -5),
    });
    const response = await myFees(pupil, `?academyId=${ownAcademy.id}`);
    expect(response.status).toBe(200);
    const body = await readJson<{
      summary: { currentFee: unknown; daysOverdue: number | null };
      data: FeeItem[];
    }>(response);
    expect(body.summary.currentFee).toEqual({
      feeId: bill.id,
      description: `Test fee ${periodStart}`,
      periodStart,
      periodEnd,
      dueDate: addDays(today, -5),
      amount: "100.00",
      currency: "NGN",
    });
    expect(body.summary.daysOverdue).toBe(5);
    // Fee rows name their people: no recorder for a bill written directly.
    expect(body.data[0]).toMatchObject({
      recordedById: null,
      recordedBy: null,
      voidedBy: null,
    });
  });

  it("recorded fees name the recorder", async () => {
    const response = await recordFee({
      request: apiRequest(feesPath(ownAcademy.id), {
        user: ownAdmin,
        method: "POST",
        body: {
          studentId: pupil.id,
          description: "Camp fee",
          periodStart: "2026-01-01",
          periodEnd: "2026-01-31",
          amount: "5000.00",
          currency: "NGN",
          paidAt: "2026-01-02T09:00:00.000Z",
        },
        headers: { "idempotency-key": newIdempotencyKey() },
      }),
      params: { academyId: ownAcademy.id },
    });
    expect(response.status).toBe(201);
    expect((await readJson<{ data: unknown }>(response)).data).toMatchObject({
      recordedById: ownAdmin.id,
      recordedBy: { id: ownAdmin.id, name: "fee-admin" },
    });
  });
});
