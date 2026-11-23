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
import {
  bulkVerifyAttendance,
  checkOutAttendance,
  createAttendance,
  getAttendance,
  listAttendance,
  listMyAttendance,
  unverifyAttendance,
  verifyAttendance,
  voidAttendance,
} from "./attendance";
import {
  AFTER_WINDOW,
  type AttendanceItem,
  createTestEvent,
  DURING_SESSION,
  deleteAttendanceData,
  type ErrorBody,
  readJson,
  SESSION_DATE,
  setClock,
  TOMORROW,
  YESTERDAY,
} from "./attendance-fixtures";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coachA: TestUser;
let coachB: TestUser;
let coachC: TestUser;
let studentA1: TestUser;
let studentA2: TestUser;
let studentB1: TestUser;
let outsider: TestUser;
let otherStudent: TestUser;
let teamA: string;
let teamB: string;
/** Team event of team A, on SESSION_DATE. */
let eventA: string;
let academyWideEvent: string;
let noAttendanceEvent: string;
/** YESTERDAY..TOMORROW, SESSION_DATE excluded. */
let campEvent: string;
let otherAcademyEvent: string;

const base = (academyId = academy.id) => `/api/v1/academies/${academyId}`;

interface CreateBody {
  entries: {
    studentId: string;
    status: string;
    checkInAt?: string;
    notes?: string;
  }[];
  eventId: string;
  sessionDate: string;
}

const record = (
  user: TestUser | undefined,
  body: CreateBody | Record<string, unknown>,
  options: { key?: string | null; academyId?: string } = {}
) => {
  const academyId = options.academyId ?? academy.id;
  const headers: Record<string, string> = {};
  if (options.key !== null) {
    headers["idempotency-key"] = options.key ?? randomUUID();
  }
  return createAttendance({
    request: apiRequest(`${base(academyId)}/attendance`, {
      user,
      method: "POST",
      body,
      headers,
    }),
    params: { academyId },
  });
};

const recordOne = async (
  user: TestUser,
  eventId: string,
  studentId: string,
  status = "present"
): Promise<AttendanceItem> => {
  const response = await record(user, {
    eventId,
    sessionDate: SESSION_DATE,
    entries: [{ studentId, status }],
  });
  expect(response.status).toBe(201);
  const body = await readJson<{ data: AttendanceItem[] }>(response);
  const [row] = body.data;
  if (!row) {
    throw new Error("No row created");
  }
  return row;
};

const list = (user: TestUser | undefined, query = "", academyId?: string) => {
  const id = academyId ?? academy.id;
  return listAttendance({
    request: apiRequest(`${base(id)}/attendance${query}`, { user }),
    params: { academyId: id },
  });
};

const action = (
  handler: typeof checkOutAttendance,
  user: TestUser | undefined,
  id: string,
  path: string,
  options: { method?: string; body?: unknown } = {}
) =>
  handler({
    request: apiRequest(`${base()}/attendance/${id}${path}`, {
      user,
      method: options.method ?? "POST",
      body: options.body,
    }),
    params: { academyId: academy.id, id },
  });

const auditRows = (entityId: string, actionName: string) =>
  db.auditLog.findMany({ where: { entityId, action: actionName } });

beforeAll(async () => {
  academy = await createTestAcademy();
  otherAcademy = await createTestAcademy();
  [
    leadAdmin,
    admin,
    coachA,
    coachB,
    coachC,
    studentA1,
    studentA2,
    studentB1,
    outsider,
    otherStudent,
  ] = await Promise.all(
    [
      "lead-admin",
      "admin",
      "coach-a",
      "coach-b",
      "coach-c",
      "student-a1",
      "student-a2",
      "student-b1",
      "outsider",
      "other-student",
    ].map((label) => createTestUser(label))
  );
  await addMember(academy, leadAdmin, "admin");
  await addMember(academy, admin, "admin");
  await addMember(academy, coachA, "coach");
  await addMember(academy, coachB, "coach");
  await addMember(academy, coachC, "coach");
  await addMember(academy, studentA1, "student");
  await addMember(academy, studentA2, "student");
  await addMember(academy, studentB1, "student");
  await addMember(otherAcademy, otherStudent, "student");
  await addMember(otherAcademy, leadAdmin, "admin");
  teamA = await createTeam(academy, [coachA, studentA1, studentA2]);
  teamB = await createTeam(academy, [coachB, studentB1]);
  // Team C shares student A1 with team A, so coach C can see A1's rows
  // but cannot act on team A's events.
  await createTeam(academy, [coachC, studentA1]);

  eventA = await createTestEvent(academy, leadAdmin, { teamId: teamA });
  academyWideEvent = await createTestEvent(academy, leadAdmin);
  noAttendanceEvent = await createTestEvent(academy, leadAdmin, {
    collectAttendance: false,
    teamId: teamA,
  });
  campEvent = await createTestEvent(academy, leadAdmin, {
    teamId: teamA,
    startDate: YESTERDAY,
    endDate: TOMORROW,
    excludedDates: [SESSION_DATE],
  });
  otherAcademyEvent = await createTestEvent(otherAcademy, leadAdmin);
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await deleteAttendanceData([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [
      leadAdmin,
      admin,
      coachA,
      coachB,
      coachC,
      studentA1,
      studentA2,
      studentB1,
      outsider,
      otherStudent,
    ]
  );
});

describe("POST /attendance", () => {
  it("lets the team's coach record a session; recordedBy comes from the session", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const response = await record(coachA, {
      eventId: event,
      sessionDate: SESSION_DATE,
      entries: [
        { studentId: studentA1.id, status: "present" },
        { studentId: studentA2.id, status: "absent", notes: "Sick" },
      ],
    });
    expect(response.status).toBe(201);
    const { data } = await readJson<{ data: AttendanceItem[] }>(response);
    expect(data).toHaveLength(2);
    const present = data.find((row) => row.studentId === studentA1.id);
    const absent = data.find((row) => row.studentId === studentA2.id);
    expect(present).toMatchObject({
      status: "present",
      recordedById: coachA.id,
      checkInAt: DURING_SESSION.toISOString(),
      sessionDate: SESSION_DATE,
      verifiedAt: null,
      voidedAt: null,
    });
    expect(absent).toMatchObject({ status: "absent", checkInAt: null });
  });

  it("lets any academy admin record", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamB });
    const byLeadAdmin = await recordOne(leadAdmin, event, studentB1.id);
    expect(byLeadAdmin.recordedById).toBe(leadAdmin.id);
    const event2 = await createTestEvent(academy, leadAdmin, { teamId: teamB });
    const byAdmin = await recordOne(admin, event2, studentB1.id, "late");
    expect(byAdmin).toMatchObject({ recordedById: admin.id, status: "late" });
  });

  it("ignores a recordedById in the body (unknown key, 400)", async () => {
    const response = await record(coachA, {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      recordedById: leadAdmin.id,
      entries: [{ studentId: studentA1.id, status: "present" }],
    });
    expect(response.status).toBe(400);
  });

  it("refuses: 401, 404 non-member, 403 student, 403 another team's coach", async () => {
    setClock(DURING_SESSION);
    const body = {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: studentA1.id, status: "present" }],
    };
    expect((await record(undefined, body)).status).toBe(401);
    const notMember = await record(outsider, body);
    expect(notMember.status).toBe(404);
    expect((await readJson<ErrorBody>(notMember)).error.code).toBe("not_found");
    expect((await record(studentA1, body)).status).toBe(403);
    const otherCoach = await record(coachB, body);
    expect(otherCoach.status).toBe(403);
    expect((await readJson<ErrorBody>(otherCoach)).error.code).toBe(
      "forbidden"
    );
  });

  it("requires an Idempotency-Key and validates the body strictly", async () => {
    const body = {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: studentA1.id, status: "present" }],
    };
    const noKey = await record(coachA, body, { key: null });
    expect(noKey.status).toBe(400);
    expect((await readJson<ErrorBody>(noKey)).error.code).toBe(
      "idempotency_key_required"
    );
    const badStatus = await record(coachA, {
      ...body,
      entries: [{ studentId: studentA1.id, status: "here" }],
    });
    expect(badStatus.status).toBe(400);
    const nestedExtra = await record(coachA, {
      ...body,
      entries: [{ studentId: studentA1.id, status: "present", extra: 1 }],
    });
    expect(nestedExtra.status).toBe(400);
    const twice = await record(coachA, {
      ...body,
      entries: [
        { studentId: studentA1.id, status: "present" },
        { studentId: studentA1.id, status: "late" },
      ],
    });
    expect(twice.status).toBe(400);
    const absentWithTime = await record(coachA, {
      ...body,
      entries: [
        {
          studentId: studentA1.id,
          status: "absent",
          checkInAt: DURING_SESSION.toISOString(),
        },
      ],
    });
    expect(absentWithTime.status).toBe(400);
  });

  it("checks the session: event in academy, collects attendance, real date, not future", async () => {
    setClock(DURING_SESSION);
    const entries = [{ studentId: studentA1.id, status: "present" }];
    const otherAcademyResponse = await record(leadAdmin, {
      eventId: otherAcademyEvent,
      sessionDate: SESSION_DATE,
      entries,
    });
    expect(otherAcademyResponse.status).toBe(404);

    const notCollected = await record(coachA, {
      eventId: noAttendanceEvent,
      sessionDate: SESSION_DATE,
      entries,
    });
    expect(notCollected.status).toBe(422);
    expect((await readJson<ErrorBody>(notCollected)).error.code).toBe(
      "attendance_not_collected"
    );

    const excluded = await record(coachA, {
      eventId: campEvent,
      sessionDate: SESSION_DATE,
      entries,
    });
    expect(excluded.status).toBe(422);
    expect((await readJson<ErrorBody>(excluded)).error.code).toBe(
      "not_a_session"
    );

    const outsideDates = await record(coachA, {
      eventId: eventA,
      sessionDate: YESTERDAY,
      entries,
    });
    expect((await readJson<ErrorBody>(outsideDates)).error.code).toBe(
      "not_a_session"
    );

    const future = await record(coachA, {
      eventId: campEvent,
      sessionDate: TOMORROW,
      entries,
    });
    expect(future.status).toBe(422);
    expect((await readJson<ErrorBody>(future)).error.code).toBe(
      "session_in_future"
    );
  });

  it("checks each student: in the academy, on the event's team, coached by the caller", async () => {
    setClock(DURING_SESSION);
    const notInAcademy = await record(coachA, {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: otherStudent.id, status: "present" }],
    });
    expect(notInAcademy.status).toBe(422);
    const body = await readJson<ErrorBody>(notInAcademy);
    expect(body.error.code).toBe("student_not_in_academy");
    expect(body.error.details).toEqual({ studentIds: [otherStudent.id] });

    const coachAsStudent = await record(leadAdmin, {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: coachB.id, status: "present" }],
    });
    expect((await readJson<ErrorBody>(coachAsStudent)).error.code).toBe(
      "student_not_in_academy"
    );

    const notOnTeam = await record(leadAdmin, {
      eventId: eventA,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: studentB1.id, status: "present" }],
    });
    expect(notOnTeam.status).toBe(422);
    expect((await readJson<ErrorBody>(notOnTeam)).error.code).toBe(
      "student_not_on_team"
    );

    const notCoached = await record(coachA, {
      eventId: academyWideEvent,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: studentB1.id, status: "present" }],
    });
    expect(notCoached.status).toBe(403);
    expect((await readJson<ErrorBody>(notCoached)).error.code).toBe(
      "not_coach_of_student"
    );
  });

  it("lets a coach record their own students at an academy-wide event", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin);
    const row = await recordOne(coachA, event, studentA2.id);
    expect(row.eventId).toBe(event);
  });

  it("returns 409 for a duplicate live row, and replays a retried key", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const body = {
      eventId: event,
      sessionDate: SESSION_DATE,
      entries: [{ studentId: studentA1.id, status: "present" }],
    };
    const key = randomUUID();
    const first = await record(coachA, body, { key });
    expect(first.status).toBe(201);
    const firstBody = await readJson(first);

    const replay = await record(coachA, body, { key });
    expect(replay.status).toBe(201);
    expect(replay.headers.get(IDEMPOTENT_REPLAY_HEADER)).toBe("true");
    expect(await readJson(replay)).toEqual(firstBody);

    const reused = await record(
      coachA,
      { ...body, entries: [{ studentId: studentA1.id, status: "late" }] },
      { key }
    );
    expect(reused.status).toBe(409);
    expect((await readJson<ErrorBody>(reused)).error.code).toBe(
      "idempotency_key_reused"
    );

    const duplicate = await record(coachA, body);
    expect(duplicate.status).toBe(409);
    const duplicateBody = await readJson<ErrorBody>(duplicate);
    expect(duplicateBody.error.code).toBe("already_recorded");
    expect(duplicateBody.error.details).toEqual({ studentIds: [studentA1.id] });

    expect(
      await db.attendance.count({ where: { eventId: event, voidedAt: null } })
    ).toBe(1);
  });
});

describe("GET /attendance and GET /attendance/:id", () => {
  let listEvent: string;
  let rowA1: AttendanceItem;
  let rowB1: AttendanceItem;

  beforeAll(async () => {
    setClock(DURING_SESSION);
    listEvent = await createTestEvent(academy, leadAdmin);
    rowA1 = await recordOne(leadAdmin, listEvent, studentA1.id);
    await recordOne(leadAdmin, listEvent, studentA2.id, "late");
    rowB1 = await recordOne(leadAdmin, listEvent, studentB1.id);
    vi.restoreAllMocks();
  });

  it("academy admins see every student; coaches only their teams'", async () => {
    const query = `?eventId=${listEvent}&date=${SESSION_DATE}`;
    const leadAdminPage = await readJson<{ data: AttendanceItem[] }>(
      await list(leadAdmin, query)
    );
    expect(leadAdminPage.data.map((row) => row.studentId).sort()).toEqual(
      [studentA1.id, studentA2.id, studentB1.id].sort()
    );
    const adminPage = await readJson<{ data: AttendanceItem[] }>(
      await list(admin, query)
    );
    expect(adminPage.data).toHaveLength(3);

    const coachPage = await readJson<{ data: AttendanceItem[] }>(
      await list(coachA, query)
    );
    expect(coachPage.data.map((row) => row.studentId).sort()).toEqual(
      [studentA1.id, studentA2.id].sort()
    );
    const coachBPage = await readJson<{ data: AttendanceItem[] }>(
      await list(coachB, query)
    );
    expect(coachBPage.data.map((row) => row.studentId)).toEqual([studentB1.id]);
  });

  it("never widens a coach's scope through studentId", async () => {
    const response = await list(coachA, `?studentId=${studentB1.id}`);
    expect(response.status).toBe(200);
    expect((await readJson<{ data: unknown[] }>(response)).data).toEqual([]);
  });

  it("filters by status, teamId and date range, and paginates", async () => {
    const late = await readJson<{ data: AttendanceItem[] }>(
      await list(leadAdmin, `?eventId=${listEvent}&status=late`)
    );
    expect(late.data.map((row) => row.studentId)).toEqual([studentA2.id]);

    const teamRows = await readJson<{ data: AttendanceItem[] }>(
      await list(
        leadAdmin,
        `?teamId=${teamB}&from=${SESSION_DATE}&to=${SESSION_DATE}`
      )
    );
    expect(teamRows.data.length).toBeGreaterThan(0);
    expect(new Set(teamRows.data.map((row) => row.studentId))).toEqual(
      new Set([studentB1.id])
    );

    const none = await readJson<{ data: unknown[] }>(
      await list(leadAdmin, `?eventId=${listEvent}&from=${TOMORROW}`)
    );
    expect(none.data).toEqual([]);

    const seen = new Set<string>();
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?eventId=${listEvent}&limit=1${
        cursor ? `&cursor=${cursor}` : ""
      }`;
      const page: { data: AttendanceItem[]; nextCursor: string | null } =
        // biome-ignore lint/performance/noAwaitInLoops: each page needs the previous cursor
        await readJson(await list(leadAdmin, query));
      for (const row of page.data) {
        seen.add(row.id);
      }
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 10);
    expect(seen.size).toBe(3);
  });

  it("refuses: 401, 404 non-member, 403 student, 400 bad filters", async () => {
    expect((await list(undefined)).status).toBe(401);
    expect((await list(outsider)).status).toBe(404);
    expect((await list(otherStudent)).status).toBe(404);
    expect((await list(studentA1)).status).toBe(403);
    expect(
      (await list(leadAdmin, `?date=${SESSION_DATE}&from=${SESSION_DATE}`))
        .status
    ).toBe(400);
    expect(
      (await list(leadAdmin, `?from=${TOMORROW}&to=${YESTERDAY}`)).status
    ).toBe(400);
    expect((await list(leadAdmin, "?status=here")).status).toBe(400);
    expect((await list(leadAdmin, "?unknown=1")).status).toBe(400);
  });

  it("does not cross academies, even for an admin of both", async () => {
    const page = await readJson<{ data: AttendanceItem[] }>(
      await list(leadAdmin, "", otherAcademy.id)
    );
    expect(page.data.some((row) => row.id === rowA1.id)).toBe(false);
    const response = await getAttendance({
      request: apiRequest(`${base(otherAcademy.id)}/attendance/${rowA1.id}`, {
        user: leadAdmin,
      }),
      params: { academyId: otherAcademy.id, id: rowA1.id },
    });
    expect(response.status).toBe(404);
  });

  it("GET /:id is scoped like the list", async () => {
    const get = (user: TestUser, id: string) =>
      getAttendance({
        request: apiRequest(`${base()}/attendance/${id}`, { user }),
        params: { academyId: academy.id, id },
      });
    const ok = await get(coachA, rowA1.id);
    expect(ok.status).toBe(200);
    expect((await readJson<{ data: AttendanceItem }>(ok)).data.id).toBe(
      rowA1.id
    );
    expect((await get(leadAdmin, rowB1.id)).status).toBe(200);
    expect((await get(coachA, rowB1.id)).status).toBe(404);
    expect((await get(coachA, "no-such-row")).status).toBe(404);
    expect((await get(studentA1, rowA1.id)).status).toBe(403);
  });
});

describe("GET /api/v1/me/attendance", () => {
  const me = (user: TestUser | undefined, query: string) =>
    listMyAttendance({
      request: apiRequest(`/api/v1/me/attendance${query}`, { user }),
      params: {},
    });

  it("returns only the student's own rows in that academy", async () => {
    const response = await me(studentA1, `?academyId=${academy.id}`);
    expect(response.status).toBe(200);
    const page = await readJson<{ data: AttendanceItem[] }>(response);
    expect(page.data.length).toBeGreaterThan(0);
    expect(page.data.every((row) => row.studentId === studentA1.id)).toBe(true);

    const filtered = await readJson<{ data: unknown[] }>(
      await me(studentA1, `?academyId=${academy.id}&from=${TOMORROW}`)
    );
    expect(filtered.data).toEqual([]);
  });

  it("refuses: 401, 400 without academyId, 404 non-member, 403 non-student", async () => {
    expect((await me(undefined, `?academyId=${academy.id}`)).status).toBe(401);
    expect((await me(studentA1, "")).status).toBe(400);
    expect((await me(studentA1, `?academyId=${otherAcademy.id}`)).status).toBe(
      404
    );
    expect((await me(coachA, `?academyId=${academy.id}`)).status).toBe(403);
    expect(
      (
        await me(
          studentA1,
          `?academyId=${academy.id}&studentId=${studentB1.id}`
        )
      ).status
    ).toBe(400);
  });
});

describe("POST /attendance/:id/check-out", () => {
  it("sets checkOutAt once and writes an audit row", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);
    const response = await action(
      checkOutAttendance,
      coachA,
      row.id,
      "/check-out"
    );
    expect(response.status).toBe(200);
    const { data } = await readJson<{ data: AttendanceItem }>(response);
    expect(data.checkOutAt).toBe(DURING_SESSION.toISOString());
    const audits = await auditRows(row.id, "attendance.check_out");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBe(coachA.id);

    const again = await action(
      checkOutAttendance,
      coachA,
      row.id,
      "/check-out"
    );
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error.code).toBe(
      "already_checked_out"
    );
  });

  it("accepts an explicit time, but not before the check-in or in the future", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(leadAdmin, event, studentA2.id);
    const early = await action(
      checkOutAttendance,
      leadAdmin,
      row.id,
      "/check-out",
      {
        body: { checkOutAt: "2026-11-23T10:00:00Z" },
      }
    );
    expect((await readJson<ErrorBody>(early)).error.code).toBe(
      "check_out_before_check_in"
    );
    const future = await action(
      checkOutAttendance,
      leadAdmin,
      row.id,
      "/check-out",
      {
        body: { checkOutAt: "2026-11-23T20:00:00Z" },
      }
    );
    expect((await readJson<ErrorBody>(future)).error.code).toBe(
      "check_out_in_future"
    );
  });

  it("returns 422 without a check-in", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id, "absent");
    const response = await action(
      checkOutAttendance,
      coachA,
      row.id,
      "/check-out"
    );
    expect(response.status).toBe(422);
    expect((await readJson<ErrorBody>(response)).error.code).toBe(
      "not_checked_in"
    );
  });

  it("refuses: 401, 404 out of scope, 403 visible but another team's event, 403 student", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);
    expect(
      (await action(checkOutAttendance, undefined, row.id, "/check-out")).status
    ).toBe(401);
    expect(
      (await action(checkOutAttendance, outsider, row.id, "/check-out")).status
    ).toBe(404);
    expect(
      (await action(checkOutAttendance, coachB, row.id, "/check-out")).status
    ).toBe(404);
    expect(
      (await action(checkOutAttendance, coachC, row.id, "/check-out")).status
    ).toBe(403);
    expect(
      (await action(checkOutAttendance, studentA1, row.id, "/check-out")).status
    ).toBe(403);
  });
});

describe("POST /attendance/:id/void", () => {
  it("voids with a reason, audits it, refuses a second void, and allows re-recording", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);

    const noReason = await action(voidAttendance, leadAdmin, row.id, "/void", {
      body: { reason: "  " },
    });
    expect(noReason.status).toBe(400);
    expect(
      (
        await action(voidAttendance, coachA, row.id, "/void", {
          body: { reason: "x" },
        })
      ).status
    ).toBe(403);
    expect(
      (
        await action(voidAttendance, outsider, row.id, "/void", {
          body: { reason: "x" },
        })
      ).status
    ).toBe(404);

    const response = await action(voidAttendance, leadAdmin, row.id, "/void", {
      body: { reason: "Wrong student" },
    });
    expect(response.status).toBe(200);
    const { data } = await readJson<{ data: AttendanceItem }>(response);
    expect(data).toMatchObject({
      voidedById: leadAdmin.id,
      voidReason: "Wrong student",
      voidedAt: DURING_SESSION.toISOString(),
    });
    const audits = await auditRows(row.id, "attendance.void");
    expect(audits).toHaveLength(1);
    expect(audits[0]?.reason).toBe("Wrong student");

    const again = await action(voidAttendance, admin, row.id, "/void", {
      body: { reason: "Again" },
    });
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error.code).toBe(
      "already_voided"
    );

    const corrected = await recordOne(coachA, event, studentA1.id, "late");
    expect(corrected.id).not.toBe(row.id);
  });
});

describe("verify and unverify", () => {
  it("ticks once (audited), returns 200 unchanged after, and refuses voided rows", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);

    const first = await action(verifyAttendance, coachA, row.id, "/verify");
    expect(first.status).toBe(200);
    const firstData = (await readJson<{ data: AttendanceItem }>(first)).data;
    expect(firstData.verifiedById).toBe(coachA.id);

    const second = await action(verifyAttendance, leadAdmin, row.id, "/verify");
    expect(second.status).toBe(200);
    expect((await readJson<{ data: AttendanceItem }>(second)).data).toEqual(
      firstData
    );
    expect(await auditRows(row.id, "attendance.verify")).toHaveLength(1);

    const other = await recordOne(coachA, event, studentA2.id);
    await action(voidAttendance, leadAdmin, other.id, "/void", {
      body: { reason: "Mistake" },
    });
    const voided = await action(verifyAttendance, coachA, other.id, "/verify");
    expect(voided.status).toBe(409);
    expect((await readJson<ErrorBody>(voided)).error.code).toBe(
      "already_voided"
    );
  });

  it("refuses: 401, 404 out of scope, 403 student, 403 not this team's coach", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);
    expect(
      (await action(verifyAttendance, undefined, row.id, "/verify")).status
    ).toBe(401);
    expect(
      (await action(verifyAttendance, coachB, row.id, "/verify")).status
    ).toBe(404);
    expect(
      (await action(verifyAttendance, coachC, row.id, "/verify")).status
    ).toBe(403);
    expect(
      (await action(verifyAttendance, studentA1, row.id, "/verify")).status
    ).toBe(403);
    expect(
      (await action(verifyAttendance, admin, row.id, "/verify")).status
    ).toBe(200);
  });

  it("unticks until the window closes (audited), then 409", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const row = await recordOne(coachA, event, studentA1.id);
    await action(verifyAttendance, coachA, row.id, "/verify");

    const untick = await action(unverifyAttendance, coachA, row.id, "/verify", {
      method: "DELETE",
    });
    expect(untick.status).toBe(200);
    const { data } = await readJson<{ data: AttendanceItem }>(untick);
    expect(data).toMatchObject({ verifiedAt: null, verifiedById: null });
    expect(await auditRows(row.id, "attendance.unverify")).toHaveLength(1);

    await action(verifyAttendance, coachA, row.id, "/verify");
    vi.restoreAllMocks();
    setClock(AFTER_WINDOW);
    const late = await action(unverifyAttendance, coachA, row.id, "/verify", {
      method: "DELETE",
    });
    expect(late.status).toBe(409);
    expect((await readJson<ErrorBody>(late)).error.code).toBe("window_closed");
    expect(
      (
        await action(unverifyAttendance, coachB, row.id, "/verify", {
          method: "DELETE",
        })
      ).status
    ).toBe(404);
  });

  it("bulk ticks with per-id results", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin);
    const a1 = await recordOne(leadAdmin, event, studentA1.id);
    const a2 = await recordOne(leadAdmin, event, studentA2.id);
    const b1 = await recordOne(leadAdmin, event, studentB1.id);
    await action(verifyAttendance, coachA, a2.id, "/verify");
    const voidEvent = await createTestEvent(academy, leadAdmin, {
      teamId: teamA,
    });
    const voided = await recordOne(leadAdmin, voidEvent, studentA1.id);
    await action(voidAttendance, leadAdmin, voided.id, "/void", {
      body: { reason: "Mistake" },
    });

    const bulk = (user: TestUser | undefined, body: unknown) =>
      bulkVerifyAttendance({
        request: apiRequest(`${base()}/attendance/verify`, {
          user,
          method: "POST",
          body,
        }),
        params: { academyId: academy.id },
      });
    const ids = [a1.id, a2.id, b1.id, voided.id, "missing-id"];
    const response = await bulk(coachA, { ids });
    expect(response.status).toBe(200);
    const { data } = await readJson<{ data: { id: string; result: string }[] }>(
      response
    );
    expect(data.map(({ id, result }) => ({ id, result }))).toEqual([
      { id: a1.id, result: "verified" },
      { id: a2.id, result: "unchanged" },
      { id: b1.id, result: "not_found" },
      { id: voided.id, result: "already_voided" },
      { id: "missing-id", result: "not_found" },
    ]);
    expect(await auditRows(a1.id, "attendance.verify")).toHaveLength(1);

    expect((await bulk(undefined, { ids })).status).toBe(401);
    expect((await bulk(outsider, { ids })).status).toBe(404);
    expect((await bulk(studentA1, { ids })).status).toBe(403);
    expect((await bulk(coachA, { ids: [] })).status).toBe(400);
    expect((await bulk(coachA, { ids: [a1.id, a1.id] })).status).toBe(400);
  });
});

describe("people on attendance rows, ?teamId= and the student's own list", () => {
  const person = (user: TestUser, name: string) => ({ id: user.id, name });

  it("every read and write response names the student (with photo) and the staff", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamA });
    const created = await record(coachA, {
      eventId: event,
      sessionDate: SESSION_DATE,
      entries: [
        { studentId: studentA1.id, status: "present" },
        { studentId: studentA2.id, status: "late" },
      ],
    });
    const createdRows = (
      await readJson<{ data: Record<string, unknown>[] }>(created)
    ).data;
    expect(createdRows.map((item) => item.student)).toEqual(
      expect.arrayContaining([
        { id: studentA1.id, name: "student-a1", image: null },
        { id: studentA2.id, name: "student-a2", image: null },
      ])
    );
    const row = createdRows.find((item) => item.studentId === studentA1.id);
    const rowId = String(row?.id);
    expect(row).toMatchObject({
      recordedById: coachA.id,
      recordedBy: person(coachA, "coach-a"),
      verifiedBy: null,
      voidedBy: null,
    });

    // One user lookup for the whole page, however many rows (no N+1).
    const userLookups = vi.spyOn(db.user, "findMany");
    const listed = await readJson<{ data: Record<string, unknown>[] }>(
      await list(coachA, `?eventId=${event}`)
    );
    expect(listed.data).toHaveLength(2);
    expect(listed.data.every((item) => item.student !== null)).toBe(true);
    expect(userLookups).toHaveBeenCalledTimes(1);
    userLookups.mockRestore();

    const got = await getAttendance({
      request: apiRequest(`${base()}/attendance/${rowId}`, { user: coachA }),
      params: { academyId: academy.id, id: rowId },
    });
    expect(
      (await readJson<{ data: Record<string, unknown> }>(got)).data
    ).toMatchObject({
      student: { id: studentA1.id, name: "student-a1", image: null },
    });

    const verified = await action(verifyAttendance, coachA, rowId, "/verify");
    expect(
      (await readJson<{ data: Record<string, unknown> }>(verified)).data
    ).toMatchObject({
      verifiedById: coachA.id,
      verifiedBy: person(coachA, "coach-a"),
      student: { id: studentA1.id },
    });

    const checkedOut = await action(
      checkOutAttendance,
      coachA,
      rowId,
      "/check-out",
      { body: {} }
    );
    expect(
      (await readJson<{ data: Record<string, unknown> }>(checkedOut)).data
    ).toMatchObject({ student: { id: studentA1.id } });

    const voided = await action(voidAttendance, leadAdmin, rowId, "/void", {
      body: { reason: "Wrong session" },
    });
    expect(
      (await readJson<{ data: Record<string, unknown> }>(voided)).data
    ).toMatchObject({
      voidedById: leadAdmin.id,
      voidedBy: person(leadAdmin, "lead-admin"),
      recordedBy: person(coachA, "coach-a"),
      student: { id: studentA1.id },
    });

    const other = createdRows.find((item) => item.studentId === studentA2.id);
    const bulk = await bulkVerifyAttendance({
      request: apiRequest(`${base()}/attendance/verify`, {
        user: coachA,
        method: "POST",
        body: { ids: [String(other?.id)] },
      }),
      params: { academyId: academy.id },
    });
    const bulkData = (
      await readJson<{ data: { data: Record<string, unknown> }[] }>(bulk)
    ).data;
    expect(bulkData[0]?.data).toMatchObject({
      student: { id: studentA2.id, name: "student-a2", image: null },
      verifiedBy: person(coachA, "coach-a"),
    });
  });

  it("?teamId= means students on that team, at any event; eventId still filters by event", async () => {
    setClock(DURING_SESSION);
    const wide = await createTestEvent(academy, leadAdmin);
    const a1 = await recordOne(leadAdmin, wide, studentA1.id);
    const b1 = await recordOne(leadAdmin, wide, studentB1.id);
    vi.restoreAllMocks();
    const teamRows = await readJson<{ data: AttendanceItem[] }>(
      await list(leadAdmin, `?teamId=${teamA}&eventId=${wide}`)
    );
    // The academy-wide event belongs to no team, yet team A's student is in.
    expect(teamRows.data.map((row) => row.id)).toEqual([a1.id]);
    const teamBRows = await readJson<{ data: AttendanceItem[] }>(
      await list(coachB, `?teamId=${teamB}&eventId=${wide}`)
    );
    expect(teamBRows.data.map((row) => row.id)).toEqual([b1.id]);
    // As GET /fees?teamId=: a coach may name only their own teams (404).
    const notTheirs = await list(coachB, `?teamId=${teamA}`);
    expect(notTheirs.status).toBe(404);
    expect((await list(leadAdmin, `?teamId=${randomUUID()}`)).status).toBe(404);
  });

  it("GET /api/v1/me/attendance leaves voided rows out; staff lists keep them", async () => {
    setClock(DURING_SESSION);
    const event = await createTestEvent(academy, leadAdmin, { teamId: teamB });
    const row = await recordOne(coachB, event, studentB1.id);
    await action(voidAttendance, leadAdmin, row.id, "/void", {
      body: { reason: "Not there" },
    });
    vi.restoreAllMocks();
    const mine = await readJson<{ data: AttendanceItem[] }>(
      await listMyAttendance({
        request: apiRequest(`/api/v1/me/attendance?academyId=${academy.id}`, {
          user: studentB1,
        }),
        params: {},
      })
    );
    expect(mine.data.some((item) => item.id === row.id)).toBe(false);
    expect(mine.data.every((item) => item.voidedAt === null)).toBe(true);
    const staff = await readJson<{ data: AttendanceItem[] }>(
      await list(coachB, `?eventId=${event}`)
    );
    expect(staff.data.map((item) => item.id)).toEqual([row.id]);
    expect(staff.data[0]?.voidedAt).not.toBeNull();
  });
});
