import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addMember,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import { getTeamAttendanceSummary } from "./attendance-summary";
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
let coachB: TestUser;
let s1: TestUser;
let s2: TestUser;
let s3: TestUser;
let outsider: TestUser;
let teamA: string;
let teamB: string;
let otherTeam: string;

const FROM = dayFromToday(-10);
const TO = dayFromToday(-8);
const RANGE = `?from=${FROM}&to=${TO}`;

const call = (
  user: TestUser | undefined,
  teamId: string,
  query = RANGE,
  academyId?: string
) => {
  const id = academyId ?? academy.id;
  return callHandler(getTeamAttendanceSummary, {
    path: `/api/v1/academies/${id}/teams/${teamId}/attendance-summary${query}`,
    params: { academyId: id, teamId },
    user,
  });
};

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(TEST_TIME_ZONE),
    createTestAcademy(TEST_TIME_ZONE),
  ]);
  [leadAdmin, admin, coachA, coachB, s1, s2, s3, outsider] = await Promise.all([
    createTestUser("lead-admin"),
    createTestUser("admin"),
    createTestUser("coach-a"),
    createTestUser("coach-b"),
    createTestUser("Ada"),
    createTestUser("Bola"),
    createTestUser("Chidi"),
    createTestUser("outsider"),
  ]);
  await Promise.all([
    addMember(academy, leadAdmin, "admin"),
    addMember(academy, admin, "admin"),
    addMember(academy, coachA, "coach"),
    addMember(academy, coachB, "coach"),
    addMember(academy, s1, "student"),
    addMember(academy, s2, "student"),
    addMember(academy, s3, "student"),
    addMember(otherAcademy, outsider, "admin"),
  ]);
  [teamA, teamB, otherTeam] = await Promise.all([
    createTeam(academy, [coachA, s1, s2]),
    createTeam(academy, [coachB, s3]),
    createTeam(otherAcademy, [outsider]),
  ]);
  const [camp, wide, teamBEvent] = await Promise.all([
    createTestEvent(academy, coachA, {
      teamId: teamA,
      startDate: dayFromToday(-11),
      endDate: TO,
    }),
    createTestEvent(academy, leadAdmin, { startDate: FROM }),
    createTestEvent(academy, coachB, { teamId: teamB, startDate: FROM }),
  ]);
  const row = (
    eventId: string,
    student: TestUser,
    sessionDate: string,
    status: "present" | "late" | "absent" | "excused",
    voided = false
  ) =>
    createTestAttendance({
      academy,
      eventId,
      student,
      recordedBy: coachA,
      sessionDate,
      status,
      voided,
    });
  await Promise.all([
    row(camp, s1, dayFromToday(-11), "absent"), // before `from`
    row(camp, s1, dayFromToday(-10), "present"),
    row(camp, s1, dayFromToday(-9), "late"),
    row(camp, s1, dayFromToday(-8), "absent"),
    row(wide, s1, FROM, "excused"),
    row(wide, s1, FROM, "present", true), // voided
    row(teamBEvent, s1, FROM, "absent"), // another team's event
    row(teamBEvent, s3, FROM, "present"),
  ]);
});

afterAll(async () => {
  await deleteTestEvents([academy, otherAcademy]);
  await cleanup(
    [academy, otherAcademy],
    [leadAdmin, admin, coachA, coachB, s1, s2, s3, outsider]
  );
});

describe("GET /teams/:teamId/attendance-summary", () => {
  it("401, 404 for non-members and unknown or foreign teams", async () => {
    expect((await call(undefined, teamA)).status).toBe(401);
    expect((await call(outsider, teamA)).status).toBe(404);
    expect((await call(leadAdmin, otherTeam)).status).toBe(404);
    expect((await call(leadAdmin, "no-such-team")).status).toBe(404);
  });

  it("403 for students (even on the team) and for other teams' coaches", async () => {
    expect((await call(s1, teamA)).status).toBe(403);
    const response = await call(coachB, teamA);
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe("forbidden");
  });

  it("400 for missing, reversed or too long ranges", async () => {
    expect((await call(leadAdmin, teamA, "")).status).toBe(400);
    expect(
      (await call(leadAdmin, teamA, `?from=${TO}&to=${FROM}`)).body.error.code
    ).toBe("invalid_range");
    expect(
      (await call(leadAdmin, teamA, "?from=2025-01-01&to=2026-06-01")).body
        .error.code
    ).toBe("range_too_long");
  });

  it("per-student rates for the team's coach: team and academy-wide events, voided rows left out", async () => {
    const response = await call(coachA, teamA);
    expect(response.status).toBe(200);
    const { data } = response.body;
    expect(data).toMatchObject({ teamId: teamA, from: FROM, to: TO });
    expect(data.students).toHaveLength(2);
    const [ada, bola] = data.students;
    expect(ada).toMatchObject({
      studentId: s1.id,
      present: 1,
      late: 1,
      absent: 1,
      excused: 1,
      total: 4,
    });
    expect(ada.rate).toBeCloseTo(2 / 3);
    expect(bola).toMatchObject({ studentId: s2.id, total: 0, rate: null });
    expect(data.team).toMatchObject({
      present: 1,
      late: 1,
      absent: 1,
      excused: 1,
    });
  });

  it("academy admins see any team's summary", async () => {
    const response = await call(leadAdmin, teamB);
    expect(response.status).toBe(200);
    expect(response.body.data.students).toEqual([
      expect.objectContaining({ studentId: s3.id, present: 1, rate: 1 }),
    ]);
    expect((await call(admin, teamA)).status).toBe(200);
  });
});
