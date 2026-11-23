import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import {
  addMember,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import {
  createEvent,
  deleteEvent,
  getEvent,
  listEvents,
  updateEvent,
} from "./events";
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
let coachA: TestUser;
let coachA2: TestUser;
let coachB: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let leftCoach: TestUser;
let outsider: TestUser;
let teamA: string;
let teamB: string;
let otherTeam: string;

let wideEvent: string;
let teamAEvent: string;
let teamBEvent: string;
let campEvent: string;
let leftCoachEvent: string;
let otherAcademyEvent: string;

const TODAY = dayFromToday(0);
const CAMP_DAYS = 5;
const CAMP_EXCLUDED = dayFromToday(2);

const eventsPath = (academyId: string, suffix = "") =>
  `/api/v1/academies/${academyId}/events${suffix}`;

const list = (
  user: TestUser | undefined,
  query: string,
  academyId?: string
) => {
  const id = academyId ?? academy.id;
  return callHandler(listEvents, {
    path: eventsPath(id, `?${query}`),
    params: { academyId: id },
    user,
  });
};

const get = (user: TestUser | undefined, id: string, academyId?: string) => {
  const academyIdValue = academyId ?? academy.id;
  return callHandler(getEvent, {
    path: eventsPath(academyIdValue, `/${id}`),
    params: { academyId: academyIdValue, id },
    user,
  });
};

const create = (
  user: TestUser | undefined,
  body: unknown,
  academyId?: string
) => {
  const id = academyId ?? academy.id;
  return callHandler(createEvent, {
    path: eventsPath(id),
    params: { academyId: id },
    user,
    method: "POST",
    body,
  });
};

const patch = (user: TestUser | undefined, id: string, body: unknown) =>
  callHandler(updateEvent, {
    path: eventsPath(academy.id, `/${id}`),
    params: { academyId: academy.id, id },
    user,
    method: "PATCH",
    body,
  });

const remove = (user: TestUser | undefined, id: string, academyId?: string) => {
  const academyIdValue = academyId ?? academy.id;
  return callHandler(deleteEvent, {
    path: eventsPath(academyIdValue, `/${id}`),
    params: { academyId: academyIdValue, id },
    user,
    method: "DELETE",
  });
};

const range = (from: string, to: string) => `from=${from}&to=${to}`;
const campRange = range(TODAY, dayFromToday(CAMP_DAYS - 1));

const ids = (body: { data: { id: string }[] }) =>
  body.data.map((row) => row.id);

const validBody = (overrides: Record<string, unknown> = {}) => ({
  title: "Thursday training",
  eventType: "training",
  startDate: dayFromToday(10),
  startTime: "16:00",
  endTime: "18:00",
  collectAttendance: true,
  ...overrides,
});

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TEST_TIME_ZONE),
    createTestAcademy(TEST_TIME_ZONE),
  ]);
  [
    leadAdmin,
    admin,
    coachA,
    coachA2,
    coachB,
    studentA,
    studentB,
    leftCoach,
    outsider,
  ] = await Promise.all([
    createTestUser("lead-admin"),
    createTestUser("admin"),
    createTestUser("coach-a"),
    createTestUser("coach-a2"),
    createTestUser("coach-b"),
    createTestUser("student-a"),
    createTestUser("student-b"),
    createTestUser("left-coach"),
    createTestUser("outsider"),
  ]);
  await Promise.all([
    addMember(academy, leadAdmin, "admin"),
    addMember(academy, admin, "admin"),
    addMember(academy, coachA, "coach"),
    addMember(academy, coachA2, "coach"),
    addMember(academy, coachB, "coach"),
    addMember(academy, studentA, "student"),
    addMember(academy, studentB, "student"),
    addMember(academy, leftCoach, "coach"),
    addMember(otherAcademy, outsider, "admin"),
  ]);
  [teamA, teamB, otherTeam] = await Promise.all([
    createTeam(academy, [coachA, coachA2, studentA, leftCoach]),
    createTeam(academy, [coachB, studentB]),
    createTeam(otherAcademy, [outsider]),
  ]);
  [
    wideEvent,
    teamAEvent,
    teamBEvent,
    campEvent,
    leftCoachEvent,
    otherAcademyEvent,
  ] = await Promise.all([
    createTestEvent(academy, leadAdmin, {
      title: "Academy open day",
      eventType: "social",
      startTime: null,
      endTime: null,
    }),
    createTestEvent(academy, coachA, {
      teamId: teamA,
      startTime: "17:00",
      endTime: "19:00",
    }),
    createTestEvent(academy, coachB, { teamId: teamB }),
    createTestEvent(academy, coachA, {
      teamId: teamA,
      title: "Camp",
      eventType: "camp",
      startTime: "09:00",
      endTime: "15:00",
      endDate: dayFromToday(CAMP_DAYS - 1),
      excludedDates: [CAMP_EXCLUDED],
    }),
    createTestEvent(academy, leftCoach, {
      teamId: teamA,
      startDate: dayFromToday(1),
    }),
    createTestEvent(otherAcademy, outsider, { teamId: otherTeam }),
  ]);
  // leftCoach created an event on team A, then left the team.
  await db.teamMember.deleteMany({
    where: { teamId: teamA, userId: leftCoach.id },
  });
});

afterAll(async () => {
  await deleteTestEvents([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [
      leadAdmin,
      admin,
      coachA,
      coachA2,
      coachB,
      studentA,
      studentB,
      leftCoach,
      outsider,
    ]
  );
});

describe("GET /events", () => {
  it("401 without a session, in the error envelope", async () => {
    const response = await list(undefined, range(TODAY, TODAY));
    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      error: { code: "unauthorized", message: expect.any(String) },
    });
  });

  it("404 for a non-member, before any validation", async () => {
    const response = await list(outsider, "colour=red");
    expect(response.status).toBe(404);
    expect(response.body.error.code).toBe("not_found");
  });

  it("400 for missing, reversed, too long or unknown query params", async () => {
    const missing = await list(studentA, "");
    expect(missing.status).toBe(400);
    expect(missing.body.error.code).toBe("validation_failed");
    expect(
      (await list(studentA, range(TODAY, dayFromToday(-1)))).body.error.code
    ).toBe("invalid_range");
    expect(
      (await list(studentA, range(TODAY, dayFromToday(92)))).body.error.code
    ).toBe("range_too_long");
    expect((await list(studentA, range(TODAY, dayFromToday(91)))).status).toBe(
      200
    );
    expect(
      (await list(studentA, `${range(TODAY, TODAY)}&colour=red`)).status
    ).toBe(400);
    expect((await list(studentA, "from=2026-02-30&to=2026-03-01")).status).toBe(
      400
    );
  });

  it("a student sees academy-wide events and their own team's, never another team's", async () => {
    const response = await list(studentA, campRange);
    expect(response.status).toBe(200);
    const seen = ids(response.body);
    expect(seen).toContain(wideEvent);
    expect(seen).toContain(teamAEvent);
    expect(seen).toContain(leftCoachEvent);
    expect(seen).not.toContain(teamBEvent);
    expect(seen).not.toContain(otherAcademyEvent);
    // The camp once per session day: 5 days minus 1 cancelled.
    const campDays = response.body.data
      .filter((row: { id: string }) => row.id === campEvent)
      .map((row: { sessionDate: string }) => row.sessionDate);
    expect(campDays).toHaveLength(CAMP_DAYS - 1);
    expect(campDays).not.toContain(CAMP_EXCLUDED);
    expect(
      response.body.data.every(
        (row: { academyId: string }) => row.academyId === academy.id
      )
    ).toBe(true);
    const studentB_ = await list(studentB, campRange);
    expect(ids(studentB_.body)).toContain(teamBEvent);
    expect(ids(studentB_.body)).not.toContain(teamAEvent);
  });

  it("occurrences are sorted by date then start time, with UTC instants", async () => {
    const response = await list(studentA, range(TODAY, TODAY));
    const today = response.body.data;
    // All-day first, then 09:00 camp, then 16:00 / 17:00.
    expect(today.map((row: { id: string }) => row.id)).toEqual([
      wideEvent,
      campEvent,
      teamAEvent,
    ]);
    const [wide, camp] = today;
    expect(wide.startsAt).toBeNull();
    expect(wide.cancelled).toBe(false);
    // 09:00 in Lagos (UTC+1) is 08:00Z.
    expect(camp.startsAt).toBe(`${TODAY}T08:00:00.000Z`);
    expect(camp.endsAt).toBe(`${TODAY}T14:00:00.000Z`);
    expect(camp.startTime).toBe("09:00");
    expect(camp.endDate).toBe(dayFromToday(CAMP_DAYS - 1));
    // The QR window, in UTC: 30 minutes before 09:00, 60 after 15:00 local.
    expect(camp.collectAttendance).toBe(true);
    expect(camp.checkInOpensAt).toBe(`${TODAY}T07:30:00.000Z`);
    expect(camp.checkInClosesAt).toBe(`${TODAY}T15:00:00.000Z`);
    // An all-day event takes no attendance: no window.
    expect(wide.checkInOpensAt).toBeNull();
    expect(wide.checkInClosesAt).toBeNull();
  });

  it("includeCancelled returns the cancelled day flagged", async () => {
    const response = await list(studentA, `${campRange}&includeCancelled=true`);
    const cancelled = response.body.data.filter(
      (row: { cancelled: boolean }) => row.cancelled
    );
    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({
      id: campEvent,
      sessionDate: CAMP_EXCLUDED,
    });
  });

  it("academy admins see every team's events", async () => {
    for (const user of [leadAdmin, admin]) {
      // biome-ignore lint/performance/noAwaitInLoops: two calls, clearer in sequence
      const seen = ids((await list(user, campRange)).body);
      expect(seen).toEqual(
        expect.arrayContaining([wideEvent, teamAEvent, teamBEvent, campEvent])
      );
      expect(seen).not.toContain(otherAcademyEvent);
    }
  });

  it("filters by teamId (own teams only for coaches and students) and eventType", async () => {
    const own = await list(coachA, `${campRange}&teamId=${teamA}`);
    expect(own.status).toBe(200);
    expect(new Set(ids(own.body))).toEqual(
      new Set([teamAEvent, campEvent, leftCoachEvent])
    );

    const other = await list(coachB, `${campRange}&teamId=${teamA}`);
    expect(other.status).toBe(403);
    expect(other.body.error.code).toBe("not_on_team");

    const leadAdminFilter = await list(
      leadAdmin,
      `${campRange}&teamId=${teamB}`
    );
    expect(ids(leadAdminFilter.body)).toEqual([teamBEvent]);

    const camps = await list(studentA, `${campRange}&eventType=camp`);
    expect(new Set(ids(camps.body))).toEqual(new Set([campEvent]));
  });

  it("paginates occurrences with a cursor, matching the unpaginated list", async () => {
    const full = (await list(leadAdmin, campRange)).body.data;
    const seen: unknown[] = [];
    let cursor: string | null = null;
    do {
      const query: string = cursor
        ? `${campRange}&limit=2&cursor=${cursor}`
        : `${campRange}&limit=2`;
      // biome-ignore lint/performance/noAwaitInLoops: each page needs the last cursor
      const page = await list(leadAdmin, query);
      expect(page.status).toBe(200);
      expect(page.body.data.length).toBeLessThanOrEqual(2);
      seen.push(...page.body.data);
      cursor = page.body.nextCursor;
    } while (cursor);
    expect(seen).toEqual(full);
    expect(
      (await list(leadAdmin, `${campRange}&cursor=garbage`)).body.error.code
    ).toBe("invalid_cursor");
  });
});

describe("GET /events/:id", () => {
  it("200 for events the caller can see, 404 otherwise", async () => {
    const wide = await get(studentA, wideEvent);
    expect(wide.status).toBe(200);
    expect(wide.body.data).toMatchObject({
      id: wideEvent,
      teamId: null,
      startDate: TODAY,
      endDate: null,
      startTime: null,
      excludedDates: [],
      createdById: leadAdmin.id,
    });
    expect((await get(studentA, teamAEvent)).status).toBe(200);
    const hidden = await get(studentA, teamBEvent);
    expect(hidden.status).toBe(404);
    expect(hidden.body.error.code).toBe("not_found");
    expect((await get(leadAdmin, teamBEvent)).status).toBe(200);
  });

  it("404 for another academy's event and for non-members; 401 without a session", async () => {
    expect((await get(leadAdmin, otherAcademyEvent)).status).toBe(404);
    expect((await get(outsider, wideEvent)).status).toBe(404);
    expect((await get(undefined, wideEvent)).status).toBe(401);
    expect((await get(leadAdmin, "no-such-event")).status).toBe(404);
  });
});

describe("POST /events", () => {
  it("401, 404 for non-members, 403 for students", async () => {
    expect((await create(undefined, validBody())).status).toBe(401);
    expect((await create(outsider, validBody({ teamId: teamA }))).status).toBe(
      404
    );
    const student = await create(studentA, validBody({ teamId: teamA }));
    expect(student.status).toBe(403);
    expect(student.body.error.code).toBe("forbidden");
  });

  it("a coach creates for their own team; created_by comes from the session", async () => {
    const response = await create(
      coachA,
      validBody({ teamId: teamA, location: "Court 2", description: "" })
    );
    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      teamId: teamA,
      createdById: coachA.id,
      academyId: academy.id,
      startTime: "16:00",
      endTime: "18:00",
      location: "Court 2",
      description: null,
      collectAttendance: true,
    });
    const smuggled = await create(
      coachA,
      validBody({ teamId: teamA, createdById: leadAdmin.id })
    );
    expect(smuggled.status).toBe(400);
  });

  it("a coach needs a teamId, of a team they are on, in this academy", async () => {
    const wide = await create(coachA, validBody());
    expect(wide.status).toBe(403);
    expect(wide.body.error.code).toBe("team_required");
    const notTheirs = await create(coachA, validBody({ teamId: teamB }));
    expect(notTheirs.status).toBe(403);
    expect(notTheirs.body.error.code).toBe("not_on_team");
    const foreign = await create(coachA, validBody({ teamId: otherTeam }));
    expect(foreign.status).toBe(404);
    expect(foreign.body.error.code).toBe("team_not_found");
    // leftCoach is still a coach of the academy, but on no team now.
    expect((await create(leftCoach, validBody({ teamId: teamA }))).status).toBe(
      403
    );
  });

  it("academy admins create academy-wide or any team's events", async () => {
    const wide = await create(
      admin,
      validBody({ eventType: "meeting", collectAttendance: false })
    );
    expect(wide.status).toBe(201);
    expect(wide.body.data.teamId).toBeNull();
    const team = await create(leadAdmin, validBody({ teamId: teamB }));
    expect(team.status).toBe(201);
    expect(team.body.data.createdById).toBe(leadAdmin.id);
    // An leadAdmin still cannot use another academy's team.
    expect(
      (await create(leadAdmin, validBody({ teamId: otherTeam }))).status
    ).toBe(404);
  });

  it("normalizes a one-day endDate and sorts excludedDates", async () => {
    const start = dayFromToday(20);
    const oneDay = await create(
      leadAdmin,
      validBody({ startDate: start, endDate: start })
    );
    expect(oneDay.body.data.endDate).toBeNull();
    const camp = await create(
      leadAdmin,
      validBody({
        eventType: "camp",
        startDate: start,
        endDate: dayFromToday(24),
        startTime: "09:00:00",
        excludedDates: [dayFromToday(23), dayFromToday(21), dayFromToday(23)],
      })
    );
    expect(camp.status).toBe(201);
    expect(camp.body.data.excludedDates).toEqual([
      dayFromToday(21),
      dayFromToday(23),
    ]);
    expect(camp.body.data.startTime).toBe("09:00");
  });

  it("400 for an unknown eventType and inconsistent dates or times", async () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ eventType: "party" }, "validation_failed"],
      [{ title: "  " }, "validation_failed"],
      [{ endDate: dayFromToday(9) }, "invalid_date_range"],
      [{ endTime: null }, "invalid_times"],
      [{ endTime: "15:00" }, "invalid_times"],
      [
        { startTime: null, endTime: null, collectAttendance: true },
        "attendance_needs_times",
      ],
      [{ excludedDates: [dayFromToday(11)] }, "excluded_date_outside_event"],
      [{ endDate: dayFromToday(10 + 400) }, "event_too_long"],
      [{ startTime: "25:00" }, "validation_failed"],
    ];
    for (const [overrides, code] of cases) {
      // biome-ignore lint/performance/noAwaitInLoops: each case is independent; sequential keeps failures readable
      const response = await create(leadAdmin, validBody(overrides));
      expect(response.status, JSON.stringify(overrides)).toBe(400);
      expect(response.body.error.code, JSON.stringify(overrides)).toBe(code);
    }
  });
});

describe("PATCH /events/:id", () => {
  it("the creator (still coaching the team) edits and updatedAt moves", async () => {
    const id = await createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: dayFromToday(30),
    });
    const before = (await get(coachA, id)).body.data;
    const response = await patch(coachA, id, {
      title: "Moved inside",
      location: "Gym",
    });
    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      title: "Moved inside",
      location: "Gym",
    });
    expect(Date.parse(response.body.data.updatedAt)).toBeGreaterThan(
      Date.parse(before.updatedAt)
    );
  });

  it("any coach of the team may edit; 403 for students and academy-wide; 404 for other teams' coaches", async () => {
    // Access by role: "Create, edit or delete team events: Team" (not only
    // the creator).
    const response = await patch(coachA2, teamAEvent, {
      description: "Edited by another coach of the team",
    });
    expect(response.status).toBe(200);
    expect((await patch(studentA, teamAEvent, { title: "Nope" })).status).toBe(
      403
    );
    expect((await patch(coachB, teamAEvent, { title: "Nope" })).status).toBe(
      404
    );
    expect((await patch(coachA, wideEvent, { title: "Nope" })).status).toBe(
      403
    );
    expect((await patch(outsider, teamAEvent, { title: "Nope" })).status).toBe(
      404
    );
  });

  it("a creator who left the team loses the event (404); an academy admin can still edit it", async () => {
    expect(
      (await patch(leftCoach, leftCoachEvent, { title: "Mine" })).status
    ).toBe(404);
    expect(
      (await patch(leadAdmin, leftCoachEvent, { title: "Admin edit" })).status
    ).toBe(200);
    expect(
      (await patch(admin, teamBEvent, { description: "Admin note" })).status
    ).toBe(200);
  });

  it("400 for an empty body, unknown keys, and an invalid resulting event", async () => {
    expect((await patch(coachA, teamAEvent, {})).body.error.code).toBe(
      "empty_update"
    );
    expect(
      (await patch(coachA, teamAEvent, { createdById: leadAdmin.id })).status
    ).toBe(400);
    const times = await patch(coachA, teamAEvent, { endTime: "16:00" });
    expect(times.status).toBe(400);
    expect(times.body.error.code).toBe("invalid_times");
  });

  it("a coach can only move an event to another of their teams", async () => {
    const toB = await patch(coachA, teamAEvent, { teamId: teamB });
    expect(toB.status).toBe(403);
    expect(toB.body.error.code).toBe("not_on_team");
    const toWide = await patch(coachA, teamAEvent, { teamId: null });
    expect(toWide.status).toBe(403);
    expect(toWide.body.error.code).toBe("team_required");
  });

  it("refuses date, time or team changes once a session has non-voided attendance", async () => {
    const day = dayFromToday(40);
    const id = await createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: day,
      endDate: dayFromToday(42),
    });
    await createTestAttendance({
      academy,
      eventId: id,
      student: studentA,
      recordedBy: coachA,
      sessionDate: day,
    });
    for (const body of [
      { startTime: "15:00" },
      { startDate: dayFromToday(41) },
      { endDate: dayFromToday(43) },
      { teamId: teamB },
    ]) {
      // biome-ignore lint/performance/noAwaitInLoops: sequential cases on one row
      const response = await patch(leadAdmin, id, body);
      expect(response.status, JSON.stringify(body)).toBe(409);
      expect(response.body.error.code).toBe("attendance_exists");
    }
    // Excluding the day that has attendance is refused; another day is fine.
    expect(
      (await patch(leadAdmin, id, { excludedDates: [day] })).body.error.code
    ).toBe("attendance_exists");
    expect(
      (await patch(leadAdmin, id, { excludedDates: [dayFromToday(42)] })).status
    ).toBe(200);
    // Other fields still change, and re-sending the same times is not a change.
    expect(
      (await patch(coachA, id, { title: "Renamed", startTime: "16:00:00" }))
        .status
    ).toBe(200);
  });

  it("voided attendance does not block a date change", async () => {
    const day = dayFromToday(50);
    const id = await createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: day,
    });
    await createTestAttendance({
      academy,
      eventId: id,
      student: studentA,
      recordedBy: coachA,
      sessionDate: day,
      voided: true,
    });
    const response = await patch(coachA, id, {
      startTime: "10:00",
      endTime: "11:00",
    });
    expect(response.status).toBe(200);
    expect(response.body.data.startTime).toBe("10:00");
  });
});

describe("DELETE /events/:id", () => {
  it("a coach of the team deletes, writing audit_log; the event is gone", async () => {
    const id = await createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: dayFromToday(60),
    });
    expect((await remove(studentA, id)).status).toBe(403);
    expect((await remove(coachB, id)).status).toBe(404);
    // Another coach of the same team, not the creator.
    const response = await remove(coachA2, id);
    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect((await get(coachA, id)).status).toBe(404);
    const audit = await db.auditLog.findMany({
      where: { entityType: "calendar_event", entityId: id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "event.delete",
      academyId: academy.id,
      actorId: coachA2.id,
    });
    expect(audit[0]?.before).toMatchObject({ id });
  });

  it("409 attendance_exists while any attendance row (even voided) points at it", async () => {
    const day = dayFromToday(61);
    const id = await createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: day,
    });
    await createTestAttendance({
      academy,
      eventId: id,
      student: studentA,
      recordedBy: coachA,
      sessionDate: day,
      voided: true,
    });
    const response = await remove(leadAdmin, id);
    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe("attendance_exists");
    expect((await get(leadAdmin, id)).status).toBe(200);
  });

  it("leadAdmin deletes any event, including one whose creator left; 404 across academies", async () => {
    const id = await createTestEvent(academy, leftCoach, {
      teamId: teamA,
      startDate: dayFromToday(62),
    });
    expect((await remove(leftCoach, id)).status).toBe(404);
    expect((await remove(leadAdmin, id)).status).toBe(204);
    expect((await remove(leadAdmin, otherAcademyEvent)).status).toBe(404);
    expect((await remove(outsider, wideEvent)).status).toBe(404);
    expect((await remove(undefined, wideEvent)).status).toBe(401);
  });
});
