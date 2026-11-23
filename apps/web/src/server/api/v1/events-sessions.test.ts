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
  callHandler,
  createTestAttendance,
  createTestEvent,
  dayFromToday,
  deleteTestEvents,
  TEST_TIME_ZONE,
} from "./events-fixtures";
import { cancelEventSession, listEventSessions } from "./events-sessions";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let leadAdmin: TestUser;
let admin: TestUser;
let coachA: TestUser;
let coachA2: TestUser;
let coachB: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let outsider: TestUser;
let teamA: string;
let campEvent: string;
let wideEvent: string;
let otherAcademyEvent: string;

const START = dayFromToday(3);
const LAST = dayFromToday(7);
const EXCLUDED = dayFromToday(5);

const sessionsPath = (academyId: string, id: string, suffix = "") =>
  `/api/v1/academies/${academyId}/events/${id}/sessions${suffix}`;

const listSessions = (
  user: TestUser | undefined,
  id: string,
  query = "",
  academyId?: string
) => {
  const academyIdValue = academyId ?? academy.id;
  return callHandler(listEventSessions, {
    path: sessionsPath(academyIdValue, id, query ? `?${query}` : ""),
    params: { academyId: academyIdValue, id },
    user,
  });
};

const cancel = (
  user: TestUser | undefined,
  id: string,
  date: string,
  body?: unknown,
  academyId?: string
) => {
  const academyIdValue = academyId ?? academy.id;
  return callHandler(cancelEventSession, {
    path: sessionsPath(academyIdValue, id, `/${date}/cancel`),
    params: { academyId: academyIdValue, id, date },
    user,
    method: "POST",
    body,
  });
};

const dates = (body: { data: { sessionDate: string }[] }) =>
  body.data.map((row) => row.sessionDate);

/** A fresh team A camp (START..LAST, EXCLUDED cancelled) per test. */
const newCamp = () =>
  createTestEvent(academy, coachA, {
    teamId: teamA,
    eventType: "camp",
    startDate: START,
    endDate: LAST,
    excludedDates: [EXCLUDED],
  });

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TEST_TIME_ZONE),
    createTestAcademy(TEST_TIME_ZONE),
  ]);
  [leadAdmin, admin, coachA, coachA2, coachB, studentA, studentB, outsider] =
    await Promise.all([
      createTestUser("lead-admin"),
      createTestUser("admin"),
      createTestUser("coach-a"),
      createTestUser("coach-a2"),
      createTestUser("coach-b"),
      createTestUser("student-a"),
      createTestUser("student-b"),
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
    addMember(otherAcademy, outsider, "admin"),
  ]);
  [teamA] = await Promise.all([
    createTeam(academy, [coachA, coachA2, studentA]),
    createTeam(academy, [coachB, studentB]),
  ]);
  [campEvent, wideEvent, otherAcademyEvent] = await Promise.all([
    newCamp(),
    createTestEvent(academy, leadAdmin, { startDate: START }),
    createTestEvent(otherAcademy, outsider, { startDate: START }),
  ]);
});

afterAll(async () => {
  await deleteTestEvents([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, admin, coachA, coachA2, coachB, studentA, studentB, outsider]
  );
});

describe("GET /events/:id/sessions", () => {
  it("lists the computed session dates, defaulting to the event's own range", async () => {
    const response = await listSessions(studentA, campEvent);
    expect(response.status).toBe(200);
    expect(dates(response.body)).toEqual([
      dayFromToday(3),
      dayFromToday(4),
      dayFromToday(6),
      dayFromToday(7),
    ]);
    // 16:00-18:00 in Lagos (UTC+1); check-in 15:30 to 19:00 local.
    expect(response.body.data[0]).toEqual({
      sessionDate: START,
      cancelled: false,
      startsAt: `${START}T15:00:00.000Z`,
      endsAt: `${START}T17:00:00.000Z`,
      checkInOpensAt: `${START}T14:30:00.000Z`,
      checkInClosesAt: `${START}T18:00:00.000Z`,
    });
  });

  it("gives no check-in window to cancelled days or events that take no attendance", async () => {
    const withCancelled = await listSessions(
      studentA,
      campEvent,
      "includeCancelled=true"
    );
    expect(withCancelled.body.data[2]).toMatchObject({
      sessionDate: EXCLUDED,
      cancelled: true,
      checkInOpensAt: null,
      checkInClosesAt: null,
    });
    const noAttendance = await createTestEvent(academy, leadAdmin, {
      startDate: START,
      collectAttendance: false,
    });
    const response = await listSessions(studentA, noAttendance);
    expect(response.body.data).toEqual([
      expect.objectContaining({
        sessionDate: START,
        startsAt: `${START}T15:00:00.000Z`,
        checkInOpensAt: null,
        checkInClosesAt: null,
      }),
    ]);
  });

  it("computes the window in the academy's own time zone (New York, across a DST change)", async () => {
    const newYork = await createTestAcademy("America/New_York");
    try {
      // 2026-11-01 is the day New York leaves DST (UTC-4 until 02:00, then UTC-5).
      const event = await createTestEvent(newYork, outsider, {
        startDate: "2026-10-31",
        endDate: "2026-11-01",
        startTime: "09:00",
        endTime: "10:00",
        collectAttendance: true,
      });
      const response = await listSessions(outsider, event, "", newYork.id);
      expect(response.status).toBe(404); // not a member
      await addMember(newYork, outsider, "student");
      const ok = await listSessions(outsider, event, "", newYork.id);
      expect(ok.body.data).toEqual([
        expect.objectContaining({
          sessionDate: "2026-10-31",
          startsAt: "2026-10-31T13:00:00.000Z",
          checkInOpensAt: "2026-10-31T12:30:00.000Z",
          checkInClosesAt: "2026-10-31T15:00:00.000Z",
        }),
        expect.objectContaining({
          sessionDate: "2026-11-01",
          startsAt: "2026-11-01T14:00:00.000Z",
          checkInOpensAt: "2026-11-01T13:30:00.000Z",
          checkInClosesAt: "2026-11-01T16:00:00.000Z",
        }),
      ]);
    } finally {
      await deleteTestEvents([newYork]);
      await db.member.deleteMany({ where: { organizationId: newYork.id } });
      await db.organization.delete({ where: { id: newYork.id } });
    }
  });

  it("narrows to from..to and can include cancelled days", async () => {
    const narrowed = await listSessions(
      studentA,
      campEvent,
      `from=${dayFromToday(4)}&to=${dayFromToday(6)}`
    );
    expect(dates(narrowed.body)).toEqual([dayFromToday(4), dayFromToday(6)]);
    const withCancelled = await listSessions(
      studentA,
      campEvent,
      "includeCancelled=true"
    );
    expect(withCancelled.body.data).toHaveLength(5);
    expect(withCancelled.body.data[2]).toMatchObject({
      sessionDate: EXCLUDED,
      cancelled: true,
    });
    const outside = await listSessions(
      studentA,
      campEvent,
      `from=${dayFromToday(30)}&to=${dayFromToday(31)}`
    );
    expect(outside.body.data).toEqual([]);
  });

  it("400 for a bad range or unknown params; 404 when the caller cannot see the event", async () => {
    const reversed = await listSessions(
      studentA,
      campEvent,
      `from=${LAST}&to=${START}`
    );
    expect(reversed.body.error.code).toBe("invalid_range");
    expect((await listSessions(studentA, campEvent, "colour=red")).status).toBe(
      400
    );
    expect((await listSessions(studentB, campEvent)).status).toBe(404);
    expect((await listSessions(coachB, campEvent)).status).toBe(404);
    expect((await listSessions(leadAdmin, otherAcademyEvent)).status).toBe(404);
    expect((await listSessions(outsider, campEvent)).status).toBe(404);
    expect((await listSessions(undefined, campEvent)).status).toBe(401);
  });
});

describe("POST /events/:id/sessions/:date/cancel", () => {
  it("a coach of the team (not the creator) cancels a day, with an audit row", async () => {
    const id = await newCamp();
    const day = dayFromToday(4);
    const response = await cancel(coachA2, id, day, { reason: "Rain" });
    expect(response.status).toBe(200);
    expect(response.body.data.excludedDates).toEqual([day, EXCLUDED]);
    expect(response.body.data.cancelledDate).toBe(day);
    const sessions = await listSessions(studentA, id);
    expect(dates(sessions.body)).not.toContain(day);
    const audit = await db.auditLog.findMany({
      where: { entityType: "calendar_event", entityId: id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "event.session_cancel",
      actorId: coachA2.id,
      academyId: academy.id,
      reason: "Rain",
    });
    expect(audit[0]?.after).toMatchObject({
      excludedDates: [expect.any(String), expect.any(String)],
    });
  });

  it("409 already_cancelled, 404 session_not_found, 400 for a non-date", async () => {
    const again = await cancel(leadAdmin, campEvent, EXCLUDED);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_cancelled");
    const outside = await cancel(leadAdmin, campEvent, dayFromToday(8));
    expect(outside.status).toBe(404);
    expect(outside.body.error.code).toBe("session_not_found");
    expect((await cancel(leadAdmin, campEvent, "2026-02-30")).status).toBe(400);
    expect(
      (await cancel(leadAdmin, campEvent, START, { colour: "red" })).status
    ).toBe(400);
  });

  it("409 attendance_exists once the session has non-voided attendance; voided rows do not count", async () => {
    const id = await newCamp();
    const live = dayFromToday(3);
    const voided = dayFromToday(4);
    await createTestAttendance({
      academy,
      eventId: id,
      student: studentA,
      recordedBy: coachA,
      sessionDate: live,
    });
    await createTestAttendance({
      academy,
      eventId: id,
      student: studentA,
      recordedBy: coachA,
      sessionDate: voided,
      voided: true,
    });
    const refused = await cancel(coachA, id, live);
    expect(refused.status).toBe(409);
    expect(refused.body.error.code).toBe("attendance_exists");
    expect((await cancel(coachA, id, voided)).status).toBe(200);
    // Other days of the same event are still cancellable.
    expect((await cancel(coachA, id, dayFromToday(6))).status).toBe(200);
  });

  it("403 for students and for coaches on academy-wide events; 404 for other teams' coaches", async () => {
    expect((await cancel(studentA, campEvent, START)).status).toBe(403);
    const coachOnWide = await cancel(coachA, wideEvent, START);
    expect(coachOnWide.status).toBe(403);
    expect((await cancel(coachB, campEvent, START)).status).toBe(404);
    expect((await cancel(outsider, campEvent, START)).status).toBe(404);
    expect((await cancel(leadAdmin, otherAcademyEvent, START)).status).toBe(
      404
    );
    expect((await cancel(undefined, campEvent, START)).status).toBe(401);
  });

  it("academy admins cancel any session, including academy-wide ones", async () => {
    const response = await cancel(admin, wideEvent, START);
    expect(response.status).toBe(200);
    expect(response.body.data.excludedDates).toEqual([START]);
    // A one-day event with its only day cancelled has no sessions left.
    expect((await listSessions(leadAdmin, wideEvent)).body.data).toEqual([]);
    const id = await newCamp();
    expect((await cancel(leadAdmin, id, LAST)).status).toBe(200);
  });
});
