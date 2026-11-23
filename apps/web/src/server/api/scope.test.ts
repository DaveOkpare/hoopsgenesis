import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../services";
import { authenticate, requireAcademyMember } from "./access";
import {
  canSeeStudent,
  getStudentIdsForCoach,
  getStudentScope,
  getTeamIdsForUser,
  isCoachOfStudent,
  isStudentOfAcademy,
  isTeamInAcademy,
  isUserOnTeam,
} from "./scope";
import {
  addMember,
  apiRequest,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "./testing/fixtures";

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let coach: TestUser;
let coachStudent: TestUser;
let studentA: TestUser;
let studentB: TestUser;
let teamA: string;
let teamB: string;
let otherTeam: string;

const memberOf = async (user: TestUser, academyId = academy.id) => {
  const session = await authenticate(apiRequest("/", { user }));
  return (await requireAcademyMember(session, academyId)).member;
};

beforeAll(async () => {
  [academy, otherAcademy] = await Promise.all([
    createTestAcademy(),
    createTestAcademy(),
  ]);
  [coach, coachStudent, studentA, studentB] = await Promise.all([
    createTestUser("scope-coach"),
    createTestUser("scope-coach-student"),
    createTestUser("scope-student-a"),
    createTestUser("scope-student-b"),
  ]);
  await addMember(academy, coach, "coach");
  // Comma-separated roles: a coach who is also a student.
  await addMember(academy, coachStudent, "coach,student");
  await addMember(academy, studentA, "student");
  await addMember(academy, studentB, "student");
  // The coach also coaches studentB in another academy; that must not leak.
  await addMember(otherAcademy, coach, "coach");
  await addMember(otherAcademy, studentB, "student");
  teamA = await createTeam(academy, [coach, studentA, coachStudent]);
  teamB = await createTeam(academy, [studentB]);
  otherTeam = await createTeam(otherAcademy, [coach, studentB]);
});

afterAll(async () => {
  await cleanup(
    [academy, otherAcademy],
    [coach, coachStudent, studentA, studentB]
  );
});

describe("scope helpers", () => {
  it("lists a coach's teams and students in one academy only", async () => {
    expect(await getTeamIdsForUser(db, academy.id, coach.id)).toEqual([teamA]);
    expect(
      (await getStudentIdsForCoach(db, academy.id, coach.id)).sort()
    ).toEqual([studentA.id, coachStudent.id].sort());
    expect(await getStudentIdsForCoach(db, otherAcademy.id, coach.id)).toEqual([
      studentB.id,
    ]);
  });

  it("checks coach-of-student, team membership and student role", async () => {
    expect(await isCoachOfStudent(db, academy.id, coach.id, studentA.id)).toBe(
      true
    );
    expect(await isCoachOfStudent(db, academy.id, coach.id, studentB.id)).toBe(
      false
    );
    expect(
      await isCoachOfStudent(db, otherAcademy.id, coach.id, studentB.id)
    ).toBe(true);
    // A student is not a coach of their teammate.
    expect(
      await isCoachOfStudent(db, academy.id, studentA.id, coachStudent.id)
    ).toBe(false);
    expect(await isUserOnTeam(db, academy.id, studentB.id, teamB)).toBe(true);
    expect(await isUserOnTeam(db, academy.id, coach.id, otherTeam)).toBe(false);
    expect(await isTeamInAcademy(db, academy.id, otherTeam)).toBe(false);
    expect(await isStudentOfAcademy(db, academy.id, coachStudent.id)).toBe(
      true
    );
    expect(await isStudentOfAcademy(db, academy.id, coach.id)).toBe(false);
  });

  it("works inside a transaction", async () => {
    const ids = await db.$transaction((tx) =>
      getTeamIdsForUser(tx, academy.id, coach.id)
    );
    expect(ids).toEqual([teamA]);
  });

  it("combines roles in getStudentScope and canSeeStudent", async () => {
    const coachMember = await memberOf(coach);
    const hybrid = await memberOf(coachStudent);
    const student = await memberOf(studentA);
    expect(hybrid).toMatchObject({
      isCoach: true,
      isStudent: true,
      isAdmin: false,
      seesWholeAcademy: false,
    });

    expect(await getStudentScope(db, student)).toEqual([studentA.id]);
    expect([...(await getStudentScope(db, hybrid))].sort()).toEqual(
      [studentA.id, coachStudent.id].sort()
    );
    expect(await canSeeStudent(db, coachMember, studentA.id)).toBe(true);
    expect(await canSeeStudent(db, coachMember, studentB.id)).toBe(false);
    expect(await canSeeStudent(db, student, studentB.id)).toBe(false);
    expect(
      await getStudentScope(db, { ...student, seesWholeAcademy: true })
    ).toBe("all");
  });
});
