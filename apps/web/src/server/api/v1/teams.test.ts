import { randomUUID } from "node:crypto";

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
import { callHandler } from "./events-fixtures";
import { listTeamMembers, listTeams } from "./teams";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let admin: TestUser;
let coachA: TestUser;
let coachStudent: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let outsider: TestUser;
let teamA: string;
let teamB: string;
let otherTeam: string;

const allUsers = () => [
  admin,
  coachA,
  coachStudent,
  studentA,
  studentB,
  outsider,
];

const roster = (
  user: TestUser | undefined,
  teamId: string,
  query = "",
  academyId = academy.id
) =>
  callHandler(listTeamMembers, {
    path: `/api/v1/academies/${academyId}/teams/${teamId}/members${query}`,
    params: { academyId, teamId },
    user,
  });

const teams = (user: TestUser | undefined, academyId = academy.id) =>
  callHandler(listTeams, {
    path: `/api/v1/academies/${academyId}/teams`,
    params: { academyId },
    user,
  });

const userIds = (body: { data: { userId: string }[] }) =>
  body.data.map((row) => row.userId).sort();

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(),
    createTestAcademy(),
  ]);
  [admin, coachA, coachStudent, studentA, studentB, outsider] =
    await Promise.all([
      createTestUser("admin"),
      createTestUser("coach-a"),
      createTestUser("coach-student"),
      createTestUser("student-a"),
      createTestUser("student-b"),
      createTestUser("outsider"),
    ]);
  await Promise.all([
    addMember(academy, admin, "admin"),
    addMember(academy, coachA, "coach"),
    addMember(academy, coachStudent, "coach,student"),
    addMember(academy, studentA, "student"),
    addMember(academy, studentB, "student"),
    addMember(otherAcademy, outsider, "admin"),
  ]);
  [teamA, teamB, otherTeam] = await Promise.all([
    createTeam(academy, [coachA, coachStudent, studentA]),
    createTeam(academy, [studentB]),
    createTeam(otherAcademy, [outsider]),
  ]);
});

afterAll(async () => {
  await cleanup([academy, otherAcademy], allUsers());
});

describe("GET /teams/:teamId/members", () => {
  it("academy admin: any team, with name, image and academy roles", async () => {
    const response = await roster(admin, teamA);
    expect(response.status).toBe(200);
    expect(userIds(response.body)).toEqual(
      [coachA.id, coachStudent.id, studentA.id].sort()
    );
    const coachStudentRow = response.body.data.find(
      (row: { userId: string }) => row.userId === coachStudent.id
    );
    expect(coachStudentRow).toEqual({
      userId: coachStudent.id,
      name: "coach-student",
      image: null,
      roles: ["coach", "student"],
    });
    expect((await roster(admin, teamB)).status).toBe(200);
  });

  it("coach and student: only a team they are on, else 404", async () => {
    expect((await roster(coachA, teamA)).status).toBe(200);
    expect((await roster(studentA, teamA)).status).toBe(200);
    expect(userIds((await roster(studentB, teamB)).body)).toEqual([
      studentB.id,
    ]);
    for (const [user, teamId] of [
      [coachA, teamB],
      [studentA, teamB],
      [studentB, teamA],
    ] as const) {
      // biome-ignore lint/performance/noAwaitInLoops: one case at a time
      const response = await roster(user, teamId);
      expect(response.status).toBe(404);
      expect(response.body.error.code).toBe("not_found");
    }
  });

  it("another academy's team or member: 404; signed out: 401", async () => {
    expect((await roster(admin, otherTeam)).status).toBe(404);
    expect((await roster(admin, randomUUID())).status).toBe(404);
    expect((await roster(outsider, teamA)).status).toBe(404);
    expect(
      (await roster(outsider, otherTeam, "", otherAcademy.id)).status
    ).toBe(200);
    expect((await roster(undefined, teamA)).status).toBe(401);
  });

  it("pages by name", async () => {
    const first = await roster(admin, teamA, "?limit=2");
    expect(first.body.data).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await roster(
      admin,
      teamA,
      `?limit=2&cursor=${first.body.nextCursor}`
    );
    expect(second.body.data).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect([...userIds(first.body), ...userIds(second.body)].sort()).toEqual(
      [coachA.id, coachStudent.id, studentA.id].sort()
    );
  });
});

describe("GET /teams", () => {
  it("academy admin: every team with member, coach and student counts", async () => {
    const response = await teams(admin);
    expect(response.status).toBe(200);
    const byId = new Map(
      response.body.data.map((row: { id: string }) => [row.id, row])
    );
    expect([...byId.keys()].sort()).toEqual([teamA, teamB].sort());
    expect(byId.get(teamA)).toMatchObject({
      memberCount: 3,
      coachCount: 2,
      studentCount: 2,
    });
    expect(byId.get(teamB)).toMatchObject({
      memberCount: 1,
      coachCount: 0,
      studentCount: 1,
    });
    expect(byId.get(teamA)).not.toHaveProperty("members");
  });

  it("coaches and students: only their own teams", async () => {
    expect(
      (await teams(coachA)).body.data.map((row: { id: string }) => row.id)
    ).toEqual([teamA]);
    expect(
      (await teams(studentB)).body.data.map((row: { id: string }) => row.id)
    ).toEqual([teamB]);
    expect((await teams(outsider)).status).toBe(404);
  });
});
