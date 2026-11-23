import { Prisma } from "@hoops-genesis/db/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import { fromPlainDate } from "../serialize";
import {
  addMember,
  cleanup,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { attendanceRate, getDashboard } from "./dashboard";
import {
  callHandler,
  createTestAttendance,
  createTestEvent,
  dayFromToday,
  deleteTestEvents,
  TEST_TIME_ZONE,
} from "./events-fixtures";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coach: TestUser;
let s1: TestUser;
let s2: TestUser;
let s3: TestUser;
let outsider: TestUser;

const TODAY = dayFromToday(0);
const LAST_WEEK = dayFromToday(-7);

const call = (user: TestUser | undefined, query = "", academyId?: string) => {
  const id = academyId ?? academy.id;
  return callHandler(getDashboard, {
    path: `/api/v1/academies/${id}/dashboard${query}`,
    params: { academyId: id },
    user,
  });
};

const fee = (
  student: TestUser,
  options: {
    periodStart: string;
    periodEnd: string;
    dueDate: string;
    paid: boolean;
    voidedBy?: TestUser;
    academyId?: string;
  }
) =>
  db.fee.create({
    data: {
      academyId: options.academyId ?? academy.id,
      studentId: student.id,
      description: "Monthly fee",
      periodStart: fromPlainDate(options.periodStart),
      periodEnd: fromPlainDate(options.periodEnd),
      dueDate: fromPlainDate(options.dueDate),
      amount: new Prisma.Decimal("15000.00"),
      currency: "NGN",
      paidAt: options.paid ? new Date() : null,
      recordedById: leadAdmin.id,
      ...(options.voidedBy
        ? {
            voidedAt: new Date(),
            voidedById: options.voidedBy.id,
            voidReason: "test",
          }
        : {}),
    },
  });

const record = (academyId: string, student: TestUser, verifiedBy?: TestUser) =>
  db.studentRecord.create({
    data: {
      academyId,
      studentId: student.id,
      recordType: "academic",
      recordedById: student.id,
      recordedOn: fromPlainDate(TODAY),
      ...(verifiedBy
        ? { status: "verified" as const, verifiedById: verifiedBy.id }
        : {}),
    },
  });

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TEST_TIME_ZONE),
    createTestAcademy(TEST_TIME_ZONE),
  ]);
  [leadAdmin, admin, coach, s1, s2, s3, outsider] = await Promise.all([
    createTestUser("lead-admin"),
    createTestUser("admin"),
    createTestUser("coach"),
    createTestUser("s1"),
    createTestUser("s2"),
    createTestUser("s3"),
    createTestUser("outsider"),
  ]);
  await Promise.all([
    addMember(academy, leadAdmin, "admin"),
    addMember(academy, admin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, s1, "student"),
    addMember(academy, s2, "coach, student"),
    addMember(academy, s3, "student"),
    addMember(otherAcademy, outsider, "admin"),
    addMember(otherAcademy, s1, "student"),
  ]);
  const [training, openDay, lastWeek] = await Promise.all([
    createTestEvent(academy, leadAdmin, { collectAttendance: true }),
    createTestEvent(academy, leadAdmin, {
      startTime: null,
      endTime: null,
      collectAttendance: false,
    }),
    createTestEvent(academy, leadAdmin, { startDate: LAST_WEEK }),
    // Today, but cancelled: not a session today.
    createTestEvent(academy, leadAdmin, { excludedDates: [TODAY] }),
    // Other academy's session today must not count.
    createTestEvent(otherAcademy, outsider, {}),
  ]);
  const row = (
    eventId: string,
    student: TestUser,
    status: "present" | "late" | "absent" | "excused",
    options: { sessionDate?: string; voided?: boolean } = {}
  ) =>
    createTestAttendance({
      academy,
      eventId,
      student,
      recordedBy: coach,
      sessionDate: options.sessionDate ?? TODAY,
      status,
      voided: options.voided,
    });
  await Promise.all([
    row(training, s1, "present"),
    row(training, s2, "late"),
    row(training, s3, "absent"),
    row(openDay, s1, "excused"),
    row(openDay, s2, "present", { voided: true }),
    row(lastWeek, s3, "present", { sessionDate: LAST_WEEK }),
  ]);
  await Promise.all([
    // s1 paid for a period covering today.
    fee(s1, {
      periodStart: dayFromToday(-10),
      periodEnd: dayFromToday(20),
      dueDate: dayFromToday(-10),
      paid: true,
    }),
    // s2's payment was voided, so s2 is outstanding.
    fee(s2, {
      periodStart: dayFromToday(-10),
      periodEnd: dayFromToday(20),
      dueDate: dayFromToday(-10),
      paid: true,
      voidedBy: leadAdmin,
    }),
    // s3: one unpaid fee overdue, one not yet due.
    fee(s3, {
      periodStart: dayFromToday(-30),
      periodEnd: dayFromToday(-1),
      dueDate: dayFromToday(-1),
      paid: false,
    }),
    fee(s3, {
      periodStart: dayFromToday(0),
      periodEnd: dayFromToday(29),
      dueDate: dayFromToday(1),
      paid: false,
    }),
  ]);
  await Promise.all([
    record(academy.id, s1),
    record(academy.id, s2, coach),
    record(otherAcademy.id, s1),
  ]);
});

afterAll(async () => {
  const academyIds = [academy.id, otherAcademy.id];
  await db.fee.deleteMany({ where: { academyId: { in: academyIds } } });
  await db.studentRecord.deleteMany({
    where: { academyId: { in: academyIds } },
  });
  await deleteTestEvents([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, admin, coach, s1, s2, s3, outsider]
  );
});

describe("attendanceRate", () => {
  it("counts present and late as attended and leaves excused out", () => {
    expect(attendanceRate({ present: 1, late: 1, absent: 2, excused: 5 })).toBe(
      0.5
    );
    expect(
      attendanceRate({ present: 0, late: 0, absent: 0, excused: 3 })
    ).toBeNull();
  });
});

describe("GET /dashboard", () => {
  it("401, 404 for non-members, 403 for coaches and students", async () => {
    expect((await call(undefined)).status).toBe(401);
    expect((await call(outsider)).status).toBe(404);
    expect((await call(coach)).status).toBe(403);
    const student = await call(s1);
    expect(student.status).toBe(403);
    expect(student.body.error.code).toBe("forbidden");
    expect((await call(leadAdmin, "?colour=red")).status).toBe(400);
  });

  it("academy admins get this academy's counts, voided rows left out", async () => {
    for (const user of [leadAdmin, admin]) {
      // biome-ignore lint/performance/noAwaitInLoops: two calls, clearer in sequence
      const response = await call(user);
      expect(response.status).toBe(200);
      const { data } = response.body;
      expect(data.today).toBe(TODAY);
      expect(data.timezone).toBe(TEST_TIME_ZONE);
      expect(data.members).toEqual({
        total: 6,
        byRole: { admin: 2, coach: 2, student: 3 },
      });
      expect(data.attendanceThisWeek).toMatchObject({
        present: 1,
        late: 1,
        absent: 1,
        excused: 1,
      });
      expect(data.attendanceThisWeek.rate).toBeCloseTo(2 / 3);
      expect(data.attendanceThisWeek.from <= TODAY).toBe(true);
      expect(data.attendanceThisWeek.to >= TODAY).toBe(true);
      expect(data.attendanceThisWeek.from > LAST_WEEK).toBe(true);
      expect(data.fees).toEqual({ outstandingStudents: 2, overdue: 1 });
      expect(data.recordsAwaitingReview).toBe(1);
      expect(data.sessionsToday).toEqual({
        date: TODAY,
        total: 2,
        takingAttendance: 1,
      });
    }
  });

  it("another academy's leadAdmin sees only their own figures", async () => {
    const response = await call(outsider, "", otherAcademy.id);
    expect(response.status).toBe(200);
    expect(response.body.data.members.total).toBe(2);
    expect(response.body.data.recordsAwaitingReview).toBe(1);
    expect(response.body.data.attendanceThisWeek.rate).toBeNull();
    expect(response.body.data.sessionsToday.total).toBe(1);
  });
});
