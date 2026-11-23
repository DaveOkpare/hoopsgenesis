/**
 * Round three additions: GET /teams and /teams/:teamId/members, the people
 * objects next to id fields, check-in window times on sessions (checked
 * against what the scan accepts at the edges, in UTC+14 and UTC-11), and the
 * smaller response changes (teamId filter, not_on_team details, currentFee).
 */
import { randomUUID } from "node:crypto";

import { Prisma } from "@hoops-genesis/db/prisma";
import { beforeAll, describe, expect, it } from "vitest";

import { localNow, toTime } from "./helpers/clock";
import { type Body, call, type User } from "./helpers/http";
import { db } from "./helpers/seed";
import {
  type Academy,
  auditRows,
  buildWorld,
  createEvent,
  createOpenEvent,
  expectStatus,
  getQrToken,
  recordAttendance,
  recordFee,
  scan,
  todayIn,
  type World,
  ZONE_FAR_EAST,
  ZONE_FAR_WEST,
} from "./helpers/world";

let w: World;

beforeAll(async () => {
  w = await buildWorld();
});

const teamIds = async (user: User, academy: Academy = w.academy) =>
  expectStatus(await call("GET", academy.path("/teams"), { user }), 200)
    .data.map((team: Body) => team.id)
    .sort();

describe("GET /teams and /teams/:teamId/members", () => {
  it("admin sees every team; coaches and students only their own", async () => {
    expect(await teamIds(w.admin)).toEqual([w.teamA, w.teamB].sort());
    expect(await teamIds(w.coach)).toEqual([w.teamA]);
    expect(await teamIds(w.coachB)).toEqual([w.teamB]);
    expect(await teamIds(w.student)).toEqual([w.teamA]);
    expect(await teamIds(w.studentFree)).toEqual([]);
  });

  it("counts are members of the academy on the team", async () => {
    const teams = expectStatus(
      await call("GET", w.academy.path("/teams"), { user: w.admin }),
      200
    ).data;
    const teamA = teams.find((team: Body) => team.id === w.teamA);
    // coach, coach2, student, student2, dual
    expect(teamA.coachCount).toBe(2);
    expect(teamA.studentCount).toBe(3);
  });

  it("non-member 404, no session 401", async () => {
    expect(
      (await call("GET", w.academy.path("/teams"), { user: w.outsider })).status
    ).toBe(404);
    expect((await call("GET", w.academy.path("/teams"))).status).toBe(401);
  });

  it("members: admin any team; coach and student only a team they are on (else 404)", async () => {
    const rosterOf = (user: User, teamId: string) =>
      call("GET", w.academy.path(`/teams/${teamId}/members`), { user });
    const byAdmin = expectStatus(await rosterOf(w.admin, w.teamB), 200).data;
    expect(byAdmin.map((row: Body) => row.userId).sort()).toEqual(
      [w.coachB.id, w.studentB.id].sort()
    );
    const byStudent = expectStatus(
      await rosterOf(w.student, w.teamA),
      200
    ).data;
    expect(byStudent.map((row: Body) => row.userId)).toContain(w.coach.id);
    expect((await rosterOf(w.coach, w.teamB)).status).toBe(404);
    expect((await rosterOf(w.student, w.teamB)).status).toBe(404);
    expect((await rosterOf(w.studentFree, w.teamA)).status).toBe(404);
    expect((await rosterOf(w.admin, w.other.teamX)).status).toBe(404);
    expect((await rosterOf(w.admin, randomUUID())).status).toBe(404);
  });

  it("rosters show names and roles, never emails", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/teams/${w.teamA}/members`),
      {
        user: w.student,
      }
    );
    const rows = expectStatus(reply, 200).data;
    const coachRow = rows.find((row: Body) => row.userId === w.coach.id);
    expect(coachRow.name).toBe(w.coach.name);
    expect(coachRow.roles).toEqual(["coach"]);
    for (const user of [w.coach, w.coach2, w.student2, w.dual]) {
      expect(reply.text).not.toContain(user.email);
    }
  });

  it("teams pagination walks every team once", async () => {
    const first = expectStatus(
      await call("GET", w.academy.path("/teams?limit=1"), { user: w.admin }),
      200
    );
    expect(first.data).toHaveLength(1);
    const second = expectStatus(
      await call(
        "GET",
        w.academy.path(
          `/teams?limit=1&cursor=${encodeURIComponent(first.nextCursor)}`
        ),
        { user: w.admin }
      ),
      200
    );
    expect(second.data).toHaveLength(1);
    expect(second.data[0].id).not.toBe(first.data[0].id);
    expect(second.nextCursor).toBeNull();
  });

  it("only GET is mounted (405 for writes)", async () => {
    for (const path of ["/teams", `/teams/${w.teamA}/members`]) {
      const reply = await call("POST", w.academy.path(path), {
        user: w.admin,
        body: { name: "x" },
      });
      expect(reply.status, path).toBe(405);
    }
  });
});

describe("people objects next to id fields", () => {
  it("attendance rows carry student { id, name, image } and recordedBy / verifiedBy / voidedBy", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.coach, event.id, [
      w.student.id,
    ]);
    expect(row.student).toEqual({
      id: w.student.id,
      name: w.student.name,
      image: null,
    });
    expect(row.recordedBy).toEqual({ id: w.coach.id, name: w.coach.name });
    expect(row.verifiedBy).toBeNull();
    await call("POST", w.academy.path(`/attendance/${row.id}/verify`), {
      user: w.coach2,
    });
    const voided = expectStatus(
      await call("POST", w.academy.path(`/attendance/${row.id}/void`), {
        user: w.admin,
        body: { reason: "people check" },
      }),
      200
    ).data;
    expect(voided.verifiedBy).toEqual({ id: w.coach2.id, name: w.coach2.name });
    expect(voided.voidedBy).toEqual({ id: w.admin.id, name: w.admin.name });
    const listed = expectStatus(
      await call("GET", w.academy.path(`/attendance?eventId=${event.id}`), {
        user: w.coach,
      }),
      200
    ).data;
    expect(listed[0].student.name).toBe(w.student.name);
  });

  it("scan replies carry the student object too", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const { token } = await getQrToken(w.academy, w.admin);
    const reply = await scan(w.student2, {
      token,
      eventId: event.id,
      sessionDate: todayIn(w.academy),
    });
    const row = expectStatus(reply, 201).data.attendance;
    expect(row.student).toEqual({
      id: w.student2.id,
      name: w.student2.name,
      image: null,
    });
    expect(row.recordedBy).toEqual({
      id: w.student2.id,
      name: w.student2.name,
    });
  });

  it("fees carry recordedBy and voidedBy; webhook-free manual fee names the admin", async () => {
    const fee = await recordFee(w.academy, w.admin, w.student.id);
    expect(fee.recordedBy).toEqual({ id: w.admin.id, name: w.admin.name });
    expect(fee.voidedBy).toBeNull();
    const voided = expectStatus(
      await call("POST", w.academy.path(`/fees/${fee.id}/void`), {
        user: w.admin,
        body: { reason: "people check" },
      }),
      200
    ).data;
    expect(voided.voidedBy).toEqual({ id: w.admin.id, name: w.admin.name });
  });

  it("audit rows carry actor { id, name } and impersonatedBy null", async () => {
    const fee = await recordFee(w.academy, w.admin, w.student2.id);
    const [row] = await auditRows(w.academy, w.admin, { entityId: fee.id });
    expect(row.actor).toEqual({ id: w.admin.id, name: w.admin.name });
    expect(row.impersonatedById).toBeNull();
    expect(row.impersonatedBy).toBeNull();
  });

  it("student-facing replies with people objects still carry no emails", async () => {
    const reply = await call(
      "GET",
      `/api/v1/me/attendance?academyId=${w.academy.id}`,
      { user: w.student }
    );
    expect(reply.status).toBe(200);
    for (const user of [w.admin, w.coach, w.coach2]) {
      expect(reply.text).not.toContain(user.email);
    }
  });
});

describe("check-in window times agree with the scan, in UTC+14 and UTC-11", () => {
  /** Minutes of margin each side of an edge (clock skew and run time). */
  const MARGIN = 2;
  const WINDOW_BEFORE = 30;
  const WINDOW_AFTER = 60;
  const SESSION = 30;
  const DAY = 1440;

  const edgeCases = (zone: string) => {
    const now = localNow(zone).minutes;
    return [
      {
        name: "opens in the past (start in 30 - margin min): accepted",
        start: now + WINDOW_BEFORE - MARGIN,
        accepted: true,
      },
      {
        name: "opens in the future (start in 30 + margin min): outside_window",
        start: now + WINDOW_BEFORE + MARGIN,
        accepted: false,
      },
      {
        name: "closes in the future (ended 60 - margin min ago): accepted",
        start: now - WINDOW_AFTER + MARGIN - SESSION,
        accepted: true,
      },
      {
        name: "closed already (ended 60 + margin min ago): outside_window",
        start: now - WINDOW_AFTER - MARGIN - SESSION,
        accepted: false,
      },
    ].filter((edge) => edge.start >= 0 && edge.start + SESSION < DAY);
  };

  for (const [zoneLabel, zone] of [
    ["UTC+14", ZONE_FAR_EAST],
    ["UTC-11", ZONE_FAR_WEST],
  ] as const) {
    describe(zoneLabel, () => {
      const academy = (): Academy =>
        zone === ZONE_FAR_EAST ? w.academy : w.other.academy;
      const adminOf = (): User =>
        zone === ZONE_FAR_EAST ? w.admin : w.other.admin;
      const studentOf = (): User =>
        zone === ZONE_FAR_EAST ? w.studentFree : w.other.student;

      for (const edge of edgeCases(zone)) {
        it(edge.name, async () => {
          const target = academy();
          const today = todayIn(target);
          const event = await createEvent(target, adminOf(), {
            teamId: null,
            collectAttendance: true,
            startTime: toTime(edge.start),
            endTime: toTime(edge.start + SESSION),
          });
          const sessions = expectStatus(
            await call("GET", target.path(`/events/${event.id}/sessions`), {
              user: adminOf(),
            }),
            200
          ).data;
          const [session] = sessions;
          const opensAt = Date.parse(session.checkInOpensAt);
          const closesAt = Date.parse(session.checkInClosesAt);
          expect(opensAt).toBe(
            Date.parse(session.startsAt) - WINDOW_BEFORE * 60_000
          );
          expect(closesAt).toBe(
            Date.parse(session.endsAt) + WINDOW_AFTER * 60_000
          );
          const listed = expectStatus(
            await call(
              "GET",
              target.path(`/events?from=${today}&to=${today}&limit=200`),
              { user: adminOf() }
            ),
            200
          ).data.find((item: Body) => item.id === event.id);
          expect(listed.checkInOpensAt).toBe(session.checkInOpensAt);
          expect(listed.checkInClosesAt).toBe(session.checkInClosesAt);
          const nowMs = Date.now();
          expect(nowMs >= opensAt && nowMs <= closesAt).toBe(edge.accepted);

          const { token } = await getQrToken(target, adminOf());
          const reply = await scan(studentOf(), {
            token,
            eventId: event.id,
            sessionDate: today,
          });
          if (edge.accepted) {
            expect(reply.status, reply.text).toBe(201);
          } else {
            expect(reply.status, reply.text).toBe(403);
            expect(reply.body.error.code).toBe("outside_window");
            expect(reply.body.error.details.opensAt).toBe(
              session.checkInOpensAt
            );
            expect(reply.body.error.details.closesAt).toBe(
              session.checkInClosesAt
            );
          }
        });
      }
    });
  }

  it("window times are null without attendance and on cancelled days", async () => {
    const plain = await createEvent(w.academy, w.admin, {
      teamId: w.teamA,
      startTime: "10:00",
      endTime: "11:00",
      collectAttendance: false,
    });
    const plainSessions = expectStatus(
      await call("GET", w.academy.path(`/events/${plain.id}/sessions`), {
        user: w.admin,
      }),
      200
    ).data;
    expect(plainSessions[0].checkInOpensAt).toBeNull();
    expect(plainSessions[0].checkInClosesAt).toBeNull();
    const taking = await createOpenEvent(w.academy, w.admin, w.teamA);
    await call(
      "POST",
      w.academy.path(
        `/events/${taking.id}/sessions/${taking.startDate}/cancel`
      ),
      { user: w.admin }
    );
    const cancelled = expectStatus(
      await call(
        "GET",
        w.academy.path(`/events/${taking.id}/sessions?includeCancelled=true`),
        { user: w.admin }
      ),
      200
    ).data;
    expect(cancelled[0].cancelled).toBe(true);
    expect(cancelled[0].checkInOpensAt).toBeNull();
  });
});

describe("smaller round-three changes", () => {
  it("GET /attendance?teamId= means students on that team, at any event", async () => {
    const wide = await createOpenEvent(w.academy, w.admin, null);
    const rows = await recordAttendance(w.academy, w.admin, wide.id, [
      w.student.id,
      w.studentB.id,
    ]);
    const teamA = expectStatus(
      await call(
        "GET",
        w.academy.path(`/attendance?teamId=${w.teamA}&eventId=${wide.id}`),
        { user: w.admin }
      ),
      200
    ).data.map((row: Body) => row.id);
    expect(teamA).toContain(rows[0].id);
    expect(teamA).not.toContain(rows[1].id);
  });

  it("not_on_team details name the team and its age group", async () => {
    await db().team.update({
      where: { id: w.teamB },
      data: { ageGroup: "U14" },
    });
    const event = await createOpenEvent(w.academy, w.admin, w.teamB);
    const { token } = await getQrToken(w.academy, w.admin);
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: todayIn(w.academy),
    });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("not_on_team");
    expect(reply.body.error.details.teamId).toBe(w.teamB);
    expect(reply.body.error.details.ageGroup).toBe("U14");
    expect(typeof reply.body.error.details.teamName).toBe("string");
  });

  it("currentFee (an unpaid billed fee) has description and period, in outstanding and /me/fees", async () => {
    const today = todayIn(w.academy);
    // An unpaid fee cannot be made over HTTP (POST /fees needs paidAt).
    const fee = await db().fee.create({
      data: {
        academyId: w.academy.id,
        studentId: w.student2.id,
        description: "November fee",
        periodStart: new Date(`${today}T00:00:00Z`),
        periodEnd: new Date(`${today}T00:00:00Z`),
        dueDate: new Date(`${today}T00:00:00Z`),
        amount: new Prisma.Decimal("15000.00"),
        currency: "NGN",
      },
    });
    const outstanding = expectStatus(
      await call("GET", w.academy.path("/fees/outstanding?limit=200"), {
        user: w.coach,
      }),
      200
    ).data.find((row: Body) => row.student.id === w.student2.id);
    expect(outstanding.currentFee).toMatchObject({
      feeId: fee.id,
      description: "November fee",
      periodStart: today,
      periodEnd: today,
      amount: "15000.00",
    });
    const mine = expectStatus(
      await call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
        user: w.student2,
      }),
      200
    );
    expect(mine.summary.currentFee).toMatchObject({
      description: "November fee",
      periodStart: today,
    });
  });
});
