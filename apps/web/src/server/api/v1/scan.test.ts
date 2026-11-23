import { randomUUID } from "node:crypto";

import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

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
import { createAcademyQrToken, toDeepLink } from "./academy-qr";
import { createAttendance, voidAttendance } from "./attendance";
import {
  AFTER_WINDOW,
  type AttendanceItem,
  BEFORE_WINDOW,
  createTestEvent,
  DURING_SESSION,
  deleteAttendanceData,
  type ErrorBody,
  FAR_POINT,
  NEAR_POINT,
  readJson,
  SESSION_DATE,
  setClock,
  TOMORROW,
  YESTERDAY,
} from "./attendance-fixtures";
import { scanAttendance } from "./scan";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let coach: TestUser;
let student: TestUser;
let student2: TestUser;
let teamBStudent: TestUser;
let outsider: TestUser;
let teamA: string;
let token: string;
let otherToken: string;

interface ScanBody {
  accuracyM: number;
  action: "check_in" | "check_out";
  eventId: string;
  isMocked?: boolean;
  latitude: number;
  longitude: number;
  sessionDate: string;
  token: string;
}

interface ScanResult {
  data: { attendance: AttendanceItem; result: string };
}

const scanBody = (
  eventId: string,
  overrides: Partial<ScanBody> = {}
): ScanBody => ({
  token,
  eventId,
  sessionDate: SESSION_DATE,
  action: "check_in",
  ...NEAR_POINT,
  accuracyM: 15,
  ...overrides,
});

const scan = (
  user: TestUser | undefined,
  body: unknown,
  key: string | null = randomUUID()
) =>
  scanAttendance({
    request: apiRequest("/api/v1/attendance/scan", {
      user,
      method: "POST",
      body,
      headers: key === null ? {} : { "idempotency-key": key },
    }),
    params: {},
  });

const expectError = async (
  response: Response,
  status: number,
  code: string
): Promise<ErrorBody["error"]> => {
  const body = await readJson<ErrorBody>(response);
  expect({ status: response.status, code: body.error.code }).toEqual({
    status,
    code,
  });
  return body.error;
};

const teamEvent = () => createTestEvent(academy, leadAdmin, { teamId: teamA });

const nonceOf = async (id: string) =>
  (
    await db.organization.findUniqueOrThrow({
      where: { id },
      select: { qrNonce: true },
    })
  ).qrNonce;

beforeAll(async () => {
  academy = await createTestAcademy();
  otherAcademy = await createTestAcademy();
  [leadAdmin, coach, student, student2, teamBStudent, outsider] =
    await Promise.all(
      [
        "lead-admin",
        "coach",
        "student",
        "student2",
        "team-b-student",
        "outsider",
      ].map((label) => createTestUser(label))
    );
  await addMember(academy, leadAdmin, "admin");
  await addMember(academy, coach, "coach");
  await addMember(academy, student, "student");
  await addMember(academy, student2, "student");
  await addMember(academy, teamBStudent, "student");
  await addMember(otherAcademy, leadAdmin, "admin");
  teamA = await createTeam(academy, [coach, student, student2]);
  await createTeam(academy, [teamBStudent]);
  token = createAcademyQrToken(academy.id, await nonceOf(academy.id));
  otherToken = createAcademyQrToken(
    otherAcademy.id,
    await nonceOf(otherAcademy.id)
  );
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await deleteAttendanceData([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, coach, student, student2, teamBStudent, outsider]
  );
});

describe("request checks before the scan validation", () => {
  it("401 without a session, 400 for a bad body or a missing Idempotency-Key", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await expectError(
      await scan(undefined, scanBody(event)),
      401,
      "unauthorized"
    );
    await expectError(
      await scan(student, { ...scanBody(event), studentId: student2.id }),
      400,
      "validation_failed"
    );
    await expectError(
      await scan(student, scanBody(event, { latitude: 91 })),
      400,
      "validation_failed"
    );
    await expectError(
      await scan(student, scanBody(event), null),
      400,
      "idempotency_key_required"
    );
  });
});

describe("scan validation, in the document's order", () => {
  it("1. invalid_code: garbage, tampered, another academy's event, and a retired print", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await expectError(
      await scan(student, scanBody(event, { token: "garbage" })),
      401,
      "invalid_code"
    );
    const tampered = `${token.slice(0, -2)}${token.endsWith("AA") ? "BB" : "AA"}`;
    await expectError(
      await scan(student, scanBody(event, { token: tampered })),
      401,
      "invalid_code"
    );
    const retired = createAcademyQrToken(academy.id, "an-old-nonce");
    await expectError(
      await scan(student, scanBody(event, { token: retired })),
      401,
      "invalid_code"
    );
    // Checked first: even a far, mocked scan reports the bad code.
    await expectError(
      await scan(
        student,
        scanBody(event, { token: "garbage", isMocked: true, ...FAR_POINT })
      ),
      401,
      "invalid_code"
    );
  });

  it("2. session_not_found: other academy, no attendance, not a session, not today", async () => {
    setClock(DURING_SESSION);
    // Valid token of another academy + this academy's event.
    const event = await teamEvent();
    await expectError(
      await scan(student, scanBody(event, { token: otherToken })),
      404,
      "session_not_found"
    );
    await expectError(
      await scan(student, scanBody("no-such-event")),
      404,
      "session_not_found"
    );
    const noAttendance = await createTestEvent(academy, leadAdmin, {
      teamId: teamA,
      collectAttendance: false,
    });
    await expectError(
      await scan(student, scanBody(noAttendance)),
      404,
      "session_not_found"
    );
    const camp = await createTestEvent(academy, leadAdmin, {
      teamId: teamA,
      startDate: YESTERDAY,
      endDate: TOMORROW,
      excludedDates: [SESSION_DATE],
    });
    await expectError(
      await scan(student, scanBody(camp)),
      404,
      "session_not_found"
    );
    // A real session of the camp, but not today.
    await expectError(
      await scan(student, scanBody(camp, { sessionDate: TOMORROW })),
      404,
      "session_not_found"
    );
    await expectError(
      await scan(student, scanBody(event, { sessionDate: YESTERDAY })),
      404,
      "session_not_found"
    );
  });

  it("3. outside_window: before it opens and after it closes, with the window in details", async () => {
    const event = await teamEvent();
    setClock(BEFORE_WINDOW);
    const early = await expectError(
      await scan(student, scanBody(event)),
      403,
      "outside_window"
    );
    expect(early.details).toEqual({
      opensAt: "2026-11-23T14:30:00.000Z",
      closesAt: "2026-11-23T18:00:00.000Z",
    });
    vi.restoreAllMocks();
    setClock(AFTER_WINDOW);
    await expectError(
      await scan(student, scanBody(event, { action: "check_out" })),
      403,
      "outside_window"
    );
    // Checked before team and location: a mocked, far scan still says window.
    await expectError(
      await scan(outsider, scanBody(event, { isMocked: true, ...FAR_POINT })),
      403,
      "outside_window"
    );
    vi.restoreAllMocks();
    // The window edges are inclusive.
    setClock(new Date("2026-11-23T14:30:00.000Z"));
    expect((await scan(student, scanBody(event))).status).toBe(201);
  });

  it("4. not_on_team: another team's student, a non-member, a coach", async () => {
    setClock(DURING_SESSION);
    await db.team.update({ where: { id: teamA }, data: { ageGroup: "U14" } });
    const event = await teamEvent();
    const notOnTeam = await expectError(
      await scan(teamBStudent, scanBody(event)),
      403,
      "not_on_team"
    );
    // For "This session is for U14".
    const teamRow = await db.team.findUniqueOrThrow({ where: { id: teamA } });
    expect(notOnTeam.details).toEqual({
      teamId: teamA,
      teamName: teamRow.name,
      ageGroup: "U14",
    });
    await expectError(
      await scan(outsider, scanBody(event)),
      403,
      "not_on_team"
    );
    await expectError(await scan(coach, scanBody(event)), 403, "not_on_team");
    // Before the mock and location checks.
    await expectError(
      await scan(teamBStudent, scanBody(event, { isMocked: true })),
      403,
      "not_on_team"
    );
    // Academy-wide events take any student of the academy.
    const wide = await createTestEvent(academy, leadAdmin);
    expect((await scan(teamBStudent, scanBody(wide))).status).toBe(201);
  });

  it("5. mock_location, before accuracy and distance", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await expectError(
      await scan(
        student,
        scanBody(event, { isMocked: true, accuracyM: 500, ...FAR_POINT })
      ),
      403,
      "mock_location"
    );
  });

  it("6. location_imprecise (422) above 100 m, before distance", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await expectError(
      await scan(student, scanBody(event, { accuracyM: 101, ...FAR_POINT })),
      422,
      "location_imprecise"
    );
    expect(
      (await scan(student, scanBody(event, { accuracyM: 100 }))).status
    ).toBe(201);
  });

  it("7. too_far returns the distance", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const error = await expectError(
      await scan(student, scanBody(event, FAR_POINT)),
      403,
      "too_far"
    );
    expect(error.details).toMatchObject({ radiusM: 150 });
    const distance = error.details?.distanceM as number;
    expect(distance).toBeGreaterThan(600);
    expect(distance).toBeLessThan(650);
    expect(Number.isInteger(distance)).toBe(true);
  });
});

describe("check in and check out", () => {
  it("checks in as present, recorded by the student, storing only the distance", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const response = await scan(
      student,
      scanBody(event, { token: toDeepLink(token) })
    );
    expect(response.status).toBe(201);
    const { data } = await readJson<ScanResult>(response);
    expect(data.result).toBe("checked_in");
    expect(data.attendance).toMatchObject({
      eventId: event,
      studentId: student.id,
      student: { id: student.id, name: expect.any(String), image: null },
      recordedById: student.id,
      recordedBy: { id: student.id, name: expect.any(String) },
      status: "present",
      checkInAt: DURING_SESSION.toISOString(),
      sessionDate: SESSION_DATE,
      checkOutAt: null,
    });
    expect(data.attendance.checkInDistanceM).toBeGreaterThanOrEqual(0);
    expect(data.attendance.checkInDistanceM).toBeLessThan(50);

    const again = await expectError(
      await scan(student, scanBody(event)),
      409,
      "already_checked_in"
    );
    expect(again.details).toMatchObject({
      checkInAt: DURING_SESSION.toISOString(),
      attendanceId: data.attendance.id,
    });
  });

  it("replays a retried Idempotency-Key without a second row", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const key = randomUUID();
    const first = await scan(student, scanBody(event), key);
    expect(first.status).toBe(201);
    const replay = await scan(student, scanBody(event), key);
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(await readJson(replay)).toEqual(await readJson(first));
    expect(await db.attendance.count({ where: { eventId: event } })).toBe(1);
  });

  it("two simultaneous check-ins make exactly one row", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const responses = await Promise.all(
      Array.from({ length: 4 }, () => scan(student2, scanBody(event)))
    );
    const statuses = responses.map((response) => response.status).sort();
    expect(statuses).toEqual([201, 409, 409, 409]);
    const conflicts = await Promise.all(
      responses
        .filter((response) => response.status === 409)
        .map((response) => readJson<ErrorBody>(response))
    );
    expect(conflicts.map((body) => body.error.code)).toEqual([
      "already_checked_in",
      "already_checked_in",
      "already_checked_in",
    ]);
    expect(
      await db.attendance.count({
        where: { eventId: event, studentId: student2.id, voidedAt: null },
      })
    ).toBe(1);
  });

  it("the partial unique index alone rejects a second live row, but not after a void", async () => {
    const event = await teamEvent();
    const row = {
      academyId: academy.id,
      eventId: event,
      sessionDate: new Date(`${SESSION_DATE}T00:00:00.000Z`),
      studentId: student2.id,
      status: "present" as const,
      recordedById: student2.id,
    };
    const results = await Promise.allSettled([
      db.attendance.create({ data: row }),
      db.attendance.create({ data: row }),
    ]);
    const rejected = results.filter((result) => result.status === "rejected");
    expect(rejected).toHaveLength(1);
    expect(String((rejected[0] as PromiseRejectedResult).reason)).toContain(
      "Unique constraint"
    );
    await db.attendance.updateMany({
      where: { eventId: event },
      data: {
        voidedAt: new Date(),
        voidedById: leadAdmin.id,
        voidReason: "test",
      },
    });
    await expect(db.attendance.create({ data: row })).resolves.toBeDefined();
  });

  it("checks out once, audited, with the distance and no coordinates", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await expectError(
      await scan(student, scanBody(event, { action: "check_out" })),
      409,
      "not_checked_in"
    );
    expect((await scan(student, scanBody(event))).status).toBe(201);
    vi.restoreAllMocks();
    const later = new Date("2026-11-23T17:00:00.000Z");
    setClock(later);
    const out = await scan(student, scanBody(event, { action: "check_out" }));
    expect(out.status).toBe(200);
    const { data } = await readJson<ScanResult>(out);
    expect(data.result).toBe("checked_out");
    expect(data.attendance.checkOutAt).toBe(later.toISOString());
    expect(data.attendance.checkOutDistanceM).toBeLessThan(50);

    const audit = await db.auditLog.findFirstOrThrow({
      where: { entityId: data.attendance.id, action: "attendance.check_out" },
    });
    expect(audit.actorId).toBe(student.id);
    const stored = await db.attendance.findUniqueOrThrow({
      where: { id: data.attendance.id },
    });
    const everything = JSON.stringify([audit, stored, data]);
    for (const coordinate of [NEAR_POINT.latitude, NEAR_POINT.longitude]) {
      expect(everything).not.toContain(String(coordinate));
    }

    const again = await expectError(
      await scan(student, scanBody(event, { action: "check_out" })),
      409,
      "already_checked_out"
    );
    expect(again.details).toEqual({ checkOutAt: later.toISOString() });
  });

  it("refuses check-out of an absent row recorded by the coach", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const recorded = await createAttendance({
      request: apiRequest(`/api/v1/academies/${academy.id}/attendance`, {
        user: coach,
        method: "POST",
        body: {
          eventId: event,
          sessionDate: SESSION_DATE,
          entries: [{ studentId: student.id, status: "absent" }],
        },
        headers: { "idempotency-key": randomUUID() },
      }),
      params: { academyId: academy.id },
    });
    expect(recorded.status).toBe(201);
    await expectError(
      await scan(student, scanBody(event, { action: "check_out" })),
      409,
      "not_checked_in"
    );
    await expectError(
      await scan(student, scanBody(event)),
      409,
      "already_checked_in"
    );
  });

  it("after a void, the student can check in again", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    const first = await readJson<ScanResult>(
      await scan(student, scanBody(event))
    );
    const voided = await voidAttendance({
      request: apiRequest(
        `/api/v1/academies/${academy.id}/attendance/${first.data.attendance.id}/void`,
        {
          user: leadAdmin,
          method: "POST",
          body: { reason: "Scanned from home" },
        }
      ),
      params: { academyId: academy.id, id: first.data.attendance.id },
    });
    expect(voided.status).toBe(200);
    // The voided row is ignored: check-out now has nothing to close.
    await expectError(
      await scan(student, scanBody(event, { action: "check_out" })),
      409,
      "not_checked_in"
    );
    const second = await scan(student, scanBody(event));
    expect(second.status).toBe(201);
    const { data } = await readJson<ScanResult>(second);
    expect(data.attendance.id).not.toBe(first.data.attendance.id);
  });

  it("a regenerated code stops the old one working", async () => {
    setClock(DURING_SESSION);
    const event = await teamEvent();
    await db.organization.update({
      where: { id: otherAcademy.id },
      data: { qrNonce: randomUUID() },
    });
    // otherToken was signed with the old nonce of the other academy.
    await expectError(
      await scan(student, scanBody(event, { token: otherToken })),
      401,
      "invalid_code"
    );
  });
});
