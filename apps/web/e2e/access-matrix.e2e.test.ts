/**
 * The four checks on every route (API endpoints, Conventions and "Access by
 * role"): no session -> 401; signed in but not a member -> 404 with the same
 * body as a missing academy; member without the permission -> 403; the
 * right role -> success. One table row per endpoint; add new routes as rows.
 *
 * Roles: admin = academy admin; coach = coach of team A; student = student on
 * team A. Rows are about student2 (team A) unless the role acts on itself.
 */
import { randomUUID } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import { type Body, call, isErrorEnvelope, type User } from "./helpers/http";
import {
  buildWorld,
  createOpenEvent,
  createRecord,
  feeBody,
  getQrToken,
  recordAttendance,
  recordBody,
  recordFee,
  todayIn,
  type World,
} from "./helpers/world";

type Role = "admin" | "coach" | "student";
const ROLES: readonly Role[] = ["admin", "coach", "student"];

interface Ctx {
  role: Role;
  user: User;
  w: World;
}

interface Target {
  body?: unknown;
  idempotent?: boolean;
  path: string;
}

interface RouteCase {
  /** Status for each academy role. */
  expect: Record<Role, number>;
  method: string;
  name: string;
  /** Status for a signed-in non-member (default 404). */
  outsider?: number;
  target: (ctx: Ctx) => Promise<Target> | Target;
}

const all = (status: number): Record<Role, number> => ({
  admin: status,
  coach: status,
  student: status,
});
const staff = (ok: number): Record<Role, number> => ({
  admin: ok,
  coach: ok,
  student: 403,
});
const adminOnly = (ok: number): Record<Role, number> => ({
  admin: ok,
  coach: 403,
  student: 403,
});

const teamEvent = (w: World): Promise<Body> =>
  createOpenEvent(w.academy, w.admin, w.teamA);

const attendanceRow = async (w: World): Promise<Body> => {
  const event = await teamEvent(w);
  const [row] = await recordAttendance(w.academy, w.admin, event.id, [
    w.student2.id,
  ]);
  return row;
};

/** A pending record the role recorded itself. */
const ownRecord = (ctx: Ctx): Promise<Body> =>
  ctx.role === "student"
    ? createRecord(ctx.w.academy, ctx.user, ctx.user.id, "academic")
    : createRecord(ctx.w.academy, ctx.user, ctx.w.student2.id, "athletic");

const ROUTES: RouteCase[] = [
  // ------------------------------------------------------------ events
  {
    name: "list events",
    method: "GET",
    expect: all(200),
    target: ({ w }) => {
      const today = todayIn(w.academy);
      return { path: w.academy.path(`/events?from=${today}&to=${today}`) };
    },
  },
  {
    name: "create a team event",
    method: "POST",
    expect: { admin: 201, coach: 201, student: 403 },
    target: ({ w }) => ({
      path: w.academy.path("/events"),
      body: {
        title: "Matrix event",
        eventType: "training",
        startDate: todayIn(w.academy),
        teamId: w.teamA,
      },
    }),
  },
  {
    name: "get one event",
    method: "GET",
    expect: all(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/events/${(await teamEvent(w)).id}`),
    }),
  },
  {
    name: "patch an event",
    method: "PATCH",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/events/${(await teamEvent(w)).id}`),
      body: { title: "Renamed" },
    }),
  },
  {
    name: "delete an event",
    method: "DELETE",
    expect: staff(204),
    target: async ({ w }) => ({
      path: w.academy.path(`/events/${(await teamEvent(w)).id}`),
    }),
  },
  {
    name: "list an event's sessions",
    method: "GET",
    expect: all(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/events/${(await teamEvent(w)).id}/sessions`),
    }),
  },
  {
    name: "cancel a session",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => {
      const event = await teamEvent(w);
      return {
        path: w.academy.path(
          `/events/${event.id}/sessions/${event.startDate}/cancel`
        ),
      };
    },
  },
  // ------------------------------------------------------------ attendance
  {
    name: "record attendance by hand",
    method: "POST",
    expect: { admin: 201, coach: 201, student: 403 },
    target: async ({ w }) => ({
      path: w.academy.path("/attendance"),
      idempotent: true,
      body: {
        eventId: (await teamEvent(w)).id,
        sessionDate: todayIn(w.academy),
        entries: [{ studentId: w.student2.id, status: "present" }],
      },
    }),
  },
  {
    name: "list attendance",
    method: "GET",
    expect: staff(200),
    target: ({ w }) => ({ path: w.academy.path("/attendance") }),
  },
  {
    name: "get one attendance row",
    method: "GET",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/attendance/${(await attendanceRow(w)).id}`),
    }),
  },
  {
    name: "check a student out by hand",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(
        `/attendance/${(await attendanceRow(w)).id}/check-out`
      ),
    }),
  },
  {
    name: "void attendance",
    method: "POST",
    expect: adminOnly(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/attendance/${(await attendanceRow(w)).id}/void`),
      body: { reason: "matrix" },
    }),
  },
  {
    name: "tick attendance",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/attendance/${(await attendanceRow(w)).id}/verify`),
    }),
  },
  {
    name: "untick attendance",
    method: "DELETE",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(`/attendance/${(await attendanceRow(w)).id}/verify`),
    }),
  },
  {
    name: "bulk tick attendance",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path("/attendance/verify"),
      body: { ids: [(await attendanceRow(w)).id] },
    }),
  },
  {
    name: "student's own attendance (/me)",
    method: "GET",
    expect: { admin: 403, coach: 403, student: 200 },
    target: ({ w }) => ({
      path: `/api/v1/me/attendance?academyId=${w.academy.id}`,
    }),
  },
  {
    name: "QR scan",
    method: "POST",
    // Admins and coaches are not student members: 403 not_on_team. So is a
    // non-member (the academy comes from the token, not the path).
    expect: { admin: 403, coach: 403, student: 201 },
    outsider: 403,
    target: async ({ w }) => {
      const event = await teamEvent(w);
      const { token } = await getQrToken(w.academy, w.admin);
      return {
        path: "/api/v1/attendance/scan",
        idempotent: true,
        body: {
          token,
          eventId: event.id,
          sessionDate: event.startDate,
          action: "check_in",
          latitude: 6.5246,
          longitude: 3.3792,
          accuracyM: 10,
        },
      };
    },
  },
  // ------------------------------------------------------------ QR
  {
    name: "get the academy QR",
    method: "GET",
    expect: adminOnly(200),
    target: ({ w }) => ({ path: w.academy.path("/academy-qr") }),
  },
  {
    name: "regenerate the academy QR",
    method: "POST",
    expect: adminOnly(200),
    target: ({ w }) => ({ path: w.academy.path("/academy-qr/regenerate") }),
  },
  // ------------------------------------------------------------ fees
  {
    name: "record a payment",
    method: "POST",
    expect: adminOnly(201),
    target: ({ w }) => ({
      path: w.academy.path("/fees"),
      idempotent: true,
      body: feeBody(w.student2.id),
    }),
  },
  {
    name: "list fees",
    method: "GET",
    // Students hold fee:read and see their own rows (Access by role: Self).
    expect: all(200),
    target: ({ w }) => ({ path: w.academy.path("/fees") }),
  },
  {
    name: "get one fee",
    method: "GET",
    // The fee is student2's: out of the student's scope, so 404.
    expect: { admin: 200, coach: 200, student: 404 },
    target: async ({ w }) => ({
      path: w.academy.path(
        `/fees/${(await recordFee(w.academy, w.admin, w.student2.id)).id}`
      ),
    }),
  },
  {
    name: "outstanding fees",
    method: "GET",
    expect: staff(200),
    target: ({ w }) => ({ path: w.academy.path("/fees/outstanding") }),
  },
  {
    name: "void a payment",
    method: "POST",
    expect: adminOnly(200),
    target: async ({ w }) => ({
      path: w.academy.path(
        `/fees/${(await recordFee(w.academy, w.admin, w.student2.id)).id}/void`
      ),
      body: { reason: "matrix" },
    }),
  },
  {
    name: "student's own fees (/me)",
    method: "GET",
    expect: { admin: 403, coach: 403, student: 200 },
    target: ({ w }) => ({ path: `/api/v1/me/fees?academyId=${w.academy.id}` }),
  },
  // ------------------------------------------------------------ records
  {
    name: "list record templates",
    method: "GET",
    expect: all(200),
    target: ({ w }) => ({ path: w.academy.path("/record-templates") }),
  },
  {
    name: "create a record",
    method: "POST",
    // Student: an academic record for themself; staff: athletic for student2.
    expect: all(201),
    target: ({ w, role, user }) => {
      const studentId = role === "student" ? user.id : w.student2.id;
      const type = role === "student" ? "academic" : "athletic";
      return {
        path: w.academy.path(`/students/${studentId}/records`),
        body: recordBody(w.academy, type),
      };
    },
  },
  {
    name: "list a student's records",
    method: "GET",
    expect: all(200),
    target: ({ w, role, user }) => ({
      path: w.academy.path(
        `/students/${role === "student" ? user.id : w.student2.id}/records`
      ),
    }),
  },
  {
    name: "record review queue",
    method: "GET",
    expect: staff(200),
    target: ({ w }) => ({ path: w.academy.path("/records?status=pending") }),
  },
  {
    name: "get one record",
    method: "GET",
    expect: all(200),
    target: async (ctx) => {
      const studentId =
        ctx.role === "student" ? ctx.user.id : ctx.w.student2.id;
      const record = await createRecord(
        ctx.w.academy,
        ctx.w.admin,
        studentId,
        "athletic"
      );
      return { path: ctx.w.academy.path(`/records/${record.id}`) };
    },
  },
  {
    name: "edit my pending record",
    method: "PATCH",
    // An academy admin may delete but not edit a pending record.
    expect: { admin: 403, coach: 200, student: 200 },
    target: async (ctx) => ({
      path: ctx.w.academy.path(`/records/${(await ownRecord(ctx)).id}`),
      body: { recordedOn: todayIn(ctx.w.academy) },
    }),
  },
  {
    name: "delete my pending record",
    method: "DELETE",
    expect: all(204),
    target: async (ctx) => ({
      path: ctx.w.academy.path(`/records/${(await ownRecord(ctx)).id}`),
    }),
  },
  {
    name: "verify a record",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(
        `/records/${(await createRecord(w.academy, w.student2, w.student2.id, "academic")).id}/verify`
      ),
    }),
  },
  {
    name: "reject a record",
    method: "POST",
    expect: staff(200),
    target: async ({ w }) => ({
      path: w.academy.path(
        `/records/${(await createRecord(w.academy, w.student2, w.student2.id, "academic")).id}/reject`
      ),
      body: { reason: "blurry" },
    }),
  },
  {
    name: "request an upload URL",
    method: "POST",
    // Storage is not configured locally: every allowed role gets 503.
    expect: all(503),
    target: ({ w }) => ({
      path: w.academy.path("/uploads"),
      body: {
        fileName: "card.pdf",
        contentType: "application/pdf",
        size: 1000,
      },
    }),
  },
  // ------------------------------------------------------------ read models
  {
    name: "academy audit log",
    method: "GET",
    expect: adminOnly(200),
    target: ({ w }) => ({ path: w.academy.path("/audit-log") }),
  },
  {
    name: "dashboard",
    method: "GET",
    expect: adminOnly(200),
    target: ({ w }) => ({ path: w.academy.path("/dashboard") }),
  },
  {
    name: "list teams",
    method: "GET",
    expect: all(200),
    target: ({ w }) => ({ path: w.academy.path("/teams") }),
  },
  {
    name: "a team's roster",
    method: "GET",
    // Coach and student are on team A.
    expect: all(200),
    target: ({ w }) => ({ path: w.academy.path(`/teams/${w.teamA}/members`) }),
  },
  {
    name: "team attendance summary",
    method: "GET",
    expect: staff(200),
    target: ({ w }) => {
      const today = todayIn(w.academy);
      return {
        path: w.academy.path(
          `/teams/${w.teamA}/attendance-summary?from=${today}&to=${today}`
        ),
      };
    },
  },
];

const send = (target: Target, method: string, user: User | null) =>
  call(method, target.path, {
    user,
    body: target.body,
    idempotencyKey: target.idempotent ? true : undefined,
  });

let world: World;
let missingAcademyBody: Body;

beforeAll(async () => {
  world = await buildWorld();
  const reply = await call("GET", `/api/v1/academies/${randomUUID()}/events`, {
    user: world.outsider,
  });
  missingAcademyBody = reply.body;
});

const userFor = (role: Role): User => world[role];

describe.each(ROUTES)("$method $name", (route) => {
  it("no session -> 401", async () => {
    const target = await route.target({
      w: world,
      role: "admin",
      user: world.admin,
    });
    const reply = await send(target, route.method, null);
    expect(reply.status, reply.text).toBe(401);
    expect(isErrorEnvelope(reply.body)).toBe(true);
  });

  it(`non-member -> ${route.outsider ?? 404}`, async () => {
    const target = await route.target({
      w: world,
      role: "admin",
      user: world.admin,
    });
    const reply = await send(target, route.method, world.outsider);
    expect(reply.status, reply.text).toBe(route.outsider ?? 404);
    expect(isErrorEnvelope(reply.body)).toBe(true);
    if (route.outsider === undefined) {
      // Same body as an academy that does not exist.
      expect(reply.body).toEqual(missingAcademyBody);
    }
  });

  for (const role of ROLES) {
    const status = route.expect[role];
    it(`${role} -> ${status}`, async () => {
      const user = userFor(role);
      const target = await route.target({ w: world, role, user });
      const reply = await send(target, route.method, user);
      expect(reply.status, reply.text).toBe(status);
      if (status >= 400) {
        expect(isErrorEnvelope(reply.body), reply.text).toBe(true);
      }
    });
  }
});
