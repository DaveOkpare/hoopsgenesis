/**
 * The platform owner's read-only academy views: data for an academy the
 * owner is not a member of, 401/403/404 for everyone else, GET only, and no
 * storage key in the records views.
 */
import { randomUUID } from "node:crypto";

import { Prisma } from "@hoops-genesis/db/prisma";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { db } from "../../../services";
import type { ApiHandler } from "../handler";
import {
  createMemoryStorage,
  type MemoryStorage,
} from "../storage/memory-storage";
import { setStorageForTesting } from "../storage/storage";
import {
  addMember,
  createTeam,
  createTestAcademy,
  createTestUser,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import {
  adminGetAttendance,
  adminGetDashboard,
  adminGetEvent,
  adminGetFee,
  adminGetRecord,
  adminGetTeamAttendanceSummary,
  adminListAcademyAuditLog,
  adminListAttendance,
  adminListEventSessions,
  adminListEvents,
  adminListFees,
  adminListInvitations,
  adminListMembers,
  adminListOutstandingFees,
  adminListRecords,
  adminListStudentRecords,
  adminListTeams,
  adminListUserMemberships,
} from "./admin-academy-views";
import {
  callHandler,
  createTestAttendance,
  createTestEvent,
  dayFromToday,
  deleteTestEvents,
  TEST_TIME_ZONE,
  type TestResponse,
} from "./events-fixtures";
import { deleteTestFees, insertFee } from "./fees.fixtures";
import { cleanupWithRecords, sprintData } from "./records-fixtures";

const HTTP_OK = 200;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const MEMORY_DOWNLOAD_URL = /^memory:\/\/download\//;

let academy: TestAcademy;
let owner: TestUser;
let academyAdmin: TestUser;
let coach: TestUser;
let student: TestUser;
let otherStudent: TestUser;
let storage: MemoryStorage;
let teamA: string;
let eventId: string;
let attendanceId: string;
let feeId: string;
let recordId: string;
let invitationId: string;
const fileKey = `records/${randomUUID()}/${randomUUID()}.jpg`;
const today = dayFromToday(0);

const allUsers = () => [owner, academyAdmin, coach, student, otherStudent];

interface ViewCase {
  check: (response: TestResponse) => void;
  handler: ApiHandler;
  name: string;
  params?: () => Record<string, string>;
  path: () => string;
}

const base = () => `/api/v1/admin/academies/${academy.id}`;

const call = (
  view: ViewCase,
  user: TestUser | undefined,
  academyId = academy.id
): Promise<TestResponse> =>
  callHandler(view.handler, {
    path: view.path().replace(academy.id, academyId),
    params: { ...view.params?.(), academyId },
    user,
  });

const ids = (response: TestResponse): string[] =>
  response.body.data.map((row: { id: string }) => row.id);

const VIEWS: ViewCase[] = [
  {
    name: "GET /attendance",
    handler: adminListAttendance,
    path: () => `${base()}/attendance`,
    check: (response) => {
      expect(ids(response)).toEqual([attendanceId]);
      expect(response.body.data[0].student).toEqual({
        id: student.id,
        name: "student",
        image: null,
      });
    },
  },
  {
    name: "GET /attendance/:id",
    handler: adminGetAttendance,
    path: () => `${base()}/attendance/${attendanceId}`,
    params: () => ({ id: attendanceId }),
    check: (response) => expect(response.body.data.id).toBe(attendanceId),
  },
  {
    name: "GET /fees",
    handler: adminListFees,
    path: () => `${base()}/fees`,
    check: (response) => expect(ids(response)).toEqual([feeId]),
  },
  {
    name: "GET /fees/:id",
    handler: adminGetFee,
    path: () => `${base()}/fees/${feeId}`,
    params: () => ({ id: feeId }),
    check: (response) => expect(response.body.data.id).toBe(feeId),
  },
  {
    name: "GET /fees/outstanding",
    handler: adminListOutstandingFees,
    path: () => `${base()}/fees/outstanding`,
    // `student` paid for this month; `otherStudent` has not.
    check: (response) =>
      expect(
        response.body.data.map(
          (row: { student: { id: string } }) => row.student.id
        )
      ).toEqual([otherStudent.id]),
  },
  {
    name: "GET /events",
    handler: adminListEvents,
    path: () => `${base()}/events?from=${today}&to=${today}`,
    check: (response) => {
      expect(ids(response)).toEqual([eventId]);
      expect(response.body.data[0].checkInOpensAt).toEqual(expect.any(String));
    },
  },
  {
    name: "GET /events/:id",
    handler: adminGetEvent,
    path: () => `${base()}/events/${eventId}`,
    params: () => ({ id: eventId }),
    check: (response) => expect(response.body.data.id).toBe(eventId),
  },
  {
    name: "GET /events/:id/sessions",
    handler: adminListEventSessions,
    path: () => `${base()}/events/${eventId}/sessions`,
    params: () => ({ id: eventId }),
    check: (response) =>
      expect(response.body.data).toEqual([
        expect.objectContaining({ sessionDate: today }),
      ]),
  },
  {
    name: "GET /records",
    handler: adminListRecords,
    path: () => `${base()}/records`,
    check: (response) => expect(ids(response)).toEqual([recordId]),
  },
  {
    name: "GET /records/:id",
    handler: adminGetRecord,
    path: () => `${base()}/records/${recordId}`,
    params: () => ({ id: recordId }),
    check: (response) => {
      expect(response.body.data.id).toBe(recordId);
      expect(response.body.data.file.url).toMatch(MEMORY_DOWNLOAD_URL);
    },
  },
  {
    name: "GET /students/:studentId/records",
    handler: adminListStudentRecords,
    path: () => `${base()}/students/${student.id}/records`,
    params: () => ({ studentId: student.id }),
    check: (response) => expect(ids(response)).toEqual([recordId]),
  },
  {
    name: "GET /dashboard",
    handler: adminGetDashboard,
    path: () => `${base()}/dashboard`,
    check: (response) => {
      expect(response.body.data.members.byRole).toEqual({
        admin: 1,
        coach: 1,
        student: 2,
      });
      expect(response.body.data.recordsAwaitingReview).toBe(1);
    },
  },
  {
    name: "GET /teams/:teamId/attendance-summary",
    handler: adminGetTeamAttendanceSummary,
    path: () =>
      `${base()}/teams/${teamA}/attendance-summary?from=${today}&to=${today}`,
    params: () => ({ teamId: teamA }),
    check: (response) =>
      expect(response.body.data.students).toEqual([
        expect.objectContaining({ studentId: student.id, present: 1 }),
      ]),
  },
  {
    name: "GET /audit-log",
    handler: adminListAcademyAuditLog,
    path: () => `${base()}/audit-log`,
    check: (response) => {
      expect(response.body.data).toEqual([
        expect.objectContaining({
          action: "test.owner_view",
          actorId: academyAdmin.id,
          actor: { id: academyAdmin.id, name: "academy-admin" },
          impersonatedById: null,
          impersonatedBy: null,
        }),
      ]);
    },
  },
  {
    name: "GET /teams",
    handler: adminListTeams,
    path: () => `${base()}/teams`,
    check: (response) => {
      const teamRow = response.body.data.find(
        (row: { id: string }) => row.id === teamA
      );
      expect(teamRow).toMatchObject({
        memberCount: 2,
        coachCount: 1,
        studentCount: 1,
        ageGroup: "U14",
      });
      expect(
        teamRow.members.map((row: { userId: string }) => row.userId).sort()
      ).toEqual([coach.id, student.id].sort());
      expect(teamRow.members[0]).toEqual({
        userId: expect.any(String),
        name: expect.any(String),
        image: null,
        roles: expect.any(Array),
      });
    },
  },
  {
    name: "GET /members",
    handler: adminListMembers,
    path: () => `${base()}/members?role=student`,
    check: (response) => {
      expect(
        response.body.data.map((row: { userId: string }) => row.userId).sort()
      ).toEqual([student.id, otherStudent.id].sort());
      expect(response.body.data[0]).toEqual({
        memberId: expect.any(String),
        userId: expect.any(String),
        name: expect.any(String),
        email: expect.stringContaining("@"),
        image: null,
        roles: ["student"],
        createdAt: expect.any(String),
      });
    },
  },
  {
    name: "GET /invitations",
    handler: adminListInvitations,
    path: () => `${base()}/invitations`,
    check: (response) =>
      expect(response.body.data).toEqual([
        expect.objectContaining({
          id: invitationId,
          roles: ["admin"],
          status: "pending",
          inviter: { id: owner.id, name: "owner" },
        }),
      ]),
  },
];

beforeAll(async () => {
  storage = createMemoryStorage();
  setStorageForTesting(storage);
  academy = await createTestAcademy(TEST_TIME_ZONE);
  [owner, academyAdmin, coach, student, otherStudent] = await Promise.all([
    createTestUser("owner", { platformRole: "admin" }),
    createTestUser("academy-admin"),
    createTestUser("coach"),
    createTestUser("student"),
    createTestUser("other-student"),
  ]);
  await Promise.all([
    addMember(academy, academyAdmin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, student, "student"),
    addMember(academy, otherStudent, "student"),
  ]);
  [teamA] = await Promise.all([
    createTeam(academy, [coach, student]),
    createTeam(academy, [otherStudent]),
  ]);
  await db.team.update({ where: { id: teamA }, data: { ageGroup: "U14" } });
  eventId = await createTestEvent(academy, coach, {
    teamId: teamA,
    startDate: today,
  });
  attendanceId = await createTestAttendance({
    academy,
    eventId,
    student,
    recordedBy: coach,
    sessionDate: today,
  });
  feeId = (
    await insertFee(academy, student.id, {
      periodStart: dayFromToday(-5),
      periodEnd: dayFromToday(25),
      paidAt: new Date(),
    })
  ).id;
  storage.put(fileKey);
  recordId = (
    await db.studentRecord.create({
      data: {
        academyId: academy.id,
        studentId: student.id,
        recordType: "athletic",
        recordedById: coach.id,
        recordedOn: new Date(`${dayFromToday(-1)}T00:00:00.000Z`),
        data: sprintData() as Prisma.InputJsonObject,
        fileUrl: fileKey,
      },
      select: { id: true },
    })
  ).id;
  invitationId = randomUUID();
  await db.invitation.create({
    data: {
      id: invitationId,
      organizationId: academy.id,
      email: `invitee-${randomUUID()}@test.hoops-genesis.local`,
      role: "admin",
      status: "pending",
      expiresAt: new Date(Date.now() + 86_400_000),
      inviterId: owner.id,
    },
  });
  // An expired invitation is not "Admin invited".
  await db.invitation.create({
    data: {
      id: randomUUID(),
      organizationId: academy.id,
      email: `expired-${randomUUID()}@test.hoops-genesis.local`,
      role: "coach",
      status: "pending",
      expiresAt: new Date(Date.now() - 1000),
      inviterId: owner.id,
    },
  });
  await db.auditLog.create({
    data: {
      academyId: academy.id,
      actorId: academyAdmin.id,
      action: "test.owner_view",
      entityType: "test",
      entityId: randomUUID(),
      before: Prisma.DbNull,
      after: Prisma.DbNull,
    },
  });
});

afterAll(async () => {
  setStorageForTesting(undefined);
  await deleteTestFees([academy]);
  await deleteTestEvents([academy]);
  await db.invitation.deleteMany({ where: { organizationId: academy.id } });
  await cleanupWithRecords([academy], allUsers());
});

describe("owner academy views", () => {
  it("is not a member of the academy", async () => {
    const membership = await db.member.findFirst({
      where: { organizationId: academy.id, userId: owner.id },
    });
    expect(membership).toBeNull();
  });

  it.each(VIEWS)(
    "$name returns the academy's data to the owner",
    async (view) => {
      const response = await call(view, owner);
      expect(response.status).toBe(HTTP_OK);
      view.check(response);
    }
  );

  it.each(VIEWS)("$name refuses everyone but platform admins", async (view) => {
    expect((await call(view, undefined)).status).toBe(HTTP_UNAUTHORIZED);
    for (const user of [academyAdmin, coach, student]) {
      // biome-ignore lint/performance/noAwaitInLoops: one call per role, in turn
      const response = await call(view, user);
      expect(response.status).toBe(HTTP_FORBIDDEN);
      expect(response.body.error.code).toBe("forbidden");
    }
  });

  it.each(VIEWS)("$name is 404 for an unknown academy", async (view) => {
    const response = await call(view, owner, randomUUID());
    expect(response.status).toBe(HTTP_NOT_FOUND);
  });

  it("never sends a record's storage key", async () => {
    for (const view of VIEWS.filter((entry) =>
      entry.name.includes("records")
    )) {
      // biome-ignore lint/performance/noAwaitInLoops: one view at a time
      const response = await call(view, owner);
      const text = JSON.stringify(response.body);
      expect(text).not.toContain(fileKey);
      expect(text).not.toContain("fileUrl");
    }
  });

  it("still scopes single rows to the academy (another academy's id is 404)", async () => {
    const other = await createTestAcademy(TEST_TIME_ZONE);
    try {
      const response = await callHandler(adminGetFee, {
        path: `/api/v1/admin/academies/${other.id}/fees/${feeId}`,
        params: { academyId: other.id, id: feeId },
        user: owner,
      });
      expect(response.status).toBe(HTTP_NOT_FOUND);
    } finally {
      await db.organization.delete({ where: { id: other.id } });
    }
  });
});

describe("GET /api/v1/admin/users/:userId/memberships", () => {
  const memberships = (user: TestUser | undefined, userId: string) =>
    callHandler(adminListUserMemberships, {
      path: `/api/v1/admin/users/${userId}/memberships`,
      params: { userId },
      user,
    });

  it("lists the user's academies, roles and teams", async () => {
    const response = await memberships(owner, student.id);
    expect(response.status).toBe(HTTP_OK);
    expect(response.body.data.user).toMatchObject({
      id: student.id,
      name: "student",
      platformRoles: ["user"],
      banned: false,
    });
    expect(response.body.data.memberships).toEqual([
      {
        memberId: expect.any(String),
        academy: { id: academy.id, name: academy.slug, slug: academy.slug },
        roles: ["student"],
        joinedAt: expect.any(String),
        teams: [{ id: teamA, name: expect.any(String), ageGroup: "U14" }],
      },
    ]);
  });

  it("401, 403 for non-admins, 404 for an unknown user", async () => {
    expect((await memberships(undefined, student.id)).status).toBe(
      HTTP_UNAUTHORIZED
    );
    expect((await memberships(academyAdmin, student.id)).status).toBe(
      HTTP_FORBIDDEN
    );
    const unknown = await memberships(owner, randomUUID());
    expect(unknown.status).toBe(HTTP_NOT_FOUND);
    expect(unknown.body.error.code).toBe("user_not_found");
  });
});

/** Route modules under the owner's read-only paths (Vite glob, eager). */
const ownerRouteModules = {
  ...import.meta.glob<{ Route: { options: { server?: unknown } } }>(
    [
      "/src/routes/api/v1/admin/academies/$academyId/**/*.ts",
      "!/src/routes/api/v1/admin/academies/$academyId/index.ts",
      "!/src/routes/api/v1/admin/academies/$academyId/admins/**",
      "!/src/routes/api/v1/admin/academies/$academyId/admin-invitations/**",
      // Owner writes: invitation codes (./invitation-codes.ts).
      "!/src/routes/api/v1/admin/academies/$academyId/invitation-codes/**",
    ],
    { eager: true }
  ),
  ...import.meta.glob<{ Route: { options: { server?: unknown } } }>(
    "/src/routes/api/v1/admin/users/**/*.ts",
    { eager: true }
  ),
};

describe("owner read-only routes", () => {
  it("mounts only GET on every one of them", () => {
    const files = Object.keys(ownerRouteModules);
    // 17 academy views plus /admin/users/:userId/memberships.
    expect(files).toHaveLength(VIEWS.length + 1);
    for (const [file, module] of Object.entries(ownerRouteModules)) {
      const server = module.Route.options.server as {
        handlers: Record<string, unknown>;
      };
      expect({ file, methods: Object.keys(server.handlers) }).toEqual({
        file,
        methods: ["GET"],
      });
    }
  });
});
