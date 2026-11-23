/**
 * QR check-in journey (User stories: CO-1, ST-2, CO-3, ST-3, AO-6, CO-4;
 * API endpoints: QR attendance, Attendance, scan validation order).
 */
import { beforeAll, describe, expect, it } from "vitest";

import { closedWindowTimes, FAR, localNow, NEAR } from "./helpers/clock";
import { type Body, call, describeReply } from "./helpers/http";
import {
  auditRows,
  buildWorld,
  createEvent,
  createOpenEvent,
  expectStatus,
  getQrToken,
  recordAttendance,
  scan,
  todayIn,
  type World,
  ZONE_FAR_EAST,
} from "./helpers/world";

let w: World;
let today: string;

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
});

describe("admin schedules, student scans, coach ticks, admin voids, coach records", () => {
  let event: Body;
  let token: string;
  let attendanceId: string;

  it("admin creates a team event for today that takes attendance", async () => {
    event = await createOpenEvent(w.academy, w.admin, w.teamA, {
      title: "Journey training",
    });
    expect(event.teamId).toBe(w.teamA);
    expect(event.collectAttendance).toBe(true);
    expect(event.startDate).toBe(today);
    expect(event.createdById).toBe(w.admin.id);
  });

  it("coach sees it in today's sessions (CO-1)", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/events?from=${today}&to=${today}`),
      { user: w.coach }
    );
    const body = expectStatus(reply, 200);
    const mine = body.data.find((item: Body) => item.id === event.id);
    expect(mine, describeReply(reply)).toBeDefined();
    expect(mine.sessionDate).toBe(today);
    expect(mine.cancelled).toBe(false);
  });

  it("team B's coach does not see team A's event", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/events?from=${today}&to=${today}`),
      { user: w.coachB }
    );
    const body = expectStatus(reply, 200);
    expect(body.data.map((item: Body) => item.id)).not.toContain(event.id);
  });

  it("student checks in with the printed code (ST-2)", async () => {
    ({ token } = await getQrToken(w.academy, w.admin));
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: today,
    });
    const body = expectStatus(reply, 201);
    expect(body.data.result).toBe("checked_in");
    const row = body.data.attendance;
    attendanceId = row.id;
    expect(row.studentId).toBe(w.student.id);
    expect(row.recordedById).toBe(w.student.id);
    expect(row.status).toBe("present");
    expect(row.checkInDistanceM).toBeGreaterThan(0);
    expect(row.checkInDistanceM).toBeLessThan(150);
    expect(row.verifiedAt).toBeNull();
  });

  it("a second check-in says already_checked_in and changes nothing", async () => {
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: today,
    });
    expect(reply.status, reply.text).toBe(409);
    expect(reply.body.error.code).toBe("already_checked_in");
  });

  it("coach watches it fill (GET /attendance?eventId=&date=)", async () => {
    const reply = await call(
      "GET",
      w.academy.path(`/attendance?eventId=${event.id}&date=${today}`),
      { user: w.coach }
    );
    const body = expectStatus(reply, 200);
    expect(body.data.map((row: Body) => row.id)).toEqual([attendanceId]);
  });

  it("coach ticks the student (CO-3); ticking again is 200 unchanged", async () => {
    const first = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/verify`),
      { user: w.coach }
    );
    const ticked = expectStatus(first, 200).data;
    expect(ticked.verifiedById).toBe(w.coach.id);
    expect(ticked.verifiedAt).not.toBeNull();
    const again = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/verify`),
      { user: w.coach2 }
    );
    expect(expectStatus(again, 200).data.verifiedById).toBe(w.coach.id);
  });

  it("student checks out the same way (ST-3)", async () => {
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: today,
      action: "check_out",
    });
    const body = expectStatus(reply, 200);
    expect(body.data.result).toBe("checked_out");
    expect(body.data.attendance.checkOutAt).not.toBeNull();
    expect(body.data.attendance.checkOutDistanceM).toBeLessThan(150);
    const again = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: today,
      action: "check_out",
    });
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_checked_out");
  });

  it("the session can no longer be cancelled (attendance exists)", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/events/${event.id}/sessions/${today}/cancel`),
      { user: w.coach }
    );
    expect(reply.status, reply.text).toBe(409);
    expect(reply.body.error.code).toBe("attendance_exists");
  });

  it("only the admin voids, with a reason (AO-6)", async () => {
    const byCoach = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/void`),
      { user: w.coach, body: { reason: "wrong" } }
    );
    expect(byCoach.status).toBe(403);
    const noReason = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/void`),
      { user: w.admin, body: {} }
    );
    expect(noReason.status).toBe(400);
    const reply = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/void`),
      { user: w.admin, body: { reason: "Photo of the code from home" } }
    );
    const row = expectStatus(reply, 200).data;
    expect(row.voidedById).toBe(w.admin.id);
    expect(row.voidReason).toBe("Photo of the code from home");
    const twice = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/void`),
      { user: w.admin, body: { reason: "again" } }
    );
    expect(twice.status).toBe(409);
    expect(twice.body.error.code).toBe("already_voided");
  });

  it("a voided row cannot be ticked", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/attendance/${attendanceId}/verify`),
      { user: w.coach }
    );
    expect(reply.status).toBe(409);
  });

  it("coach then records the student by hand (CO-4), shown as recorded by the coach", async () => {
    const [row] = await recordAttendance(
      w.academy,
      w.coach,
      event.id,
      [w.student.id],
      { status: "late" }
    );
    expect(row.recordedById).toBe(w.coach.id);
    expect(row.status).toBe("late");
    expect(row.checkInAt).not.toBeNull();
    const list = await call(
      "GET",
      w.academy.path(`/attendance?eventId=${event.id}&date=${today}`),
      { user: w.coach }
    );
    // The voided row stays visible next to the new one.
    const rows = expectStatus(list, 200).data;
    expect(rows).toHaveLength(2);
    expect(rows.filter((item: Body) => item.voidedAt === null)).toHaveLength(1);
  });

  it("the student sees their own history; the voided row is left out (ST-4)", async () => {
    const reply = await call(
      "GET",
      `/api/v1/me/attendance?academyId=${w.academy.id}&from=${today}&to=${today}`,
      { user: w.student }
    );
    const rows = expectStatus(reply, 200).data;
    expect(rows.every((row: Body) => row.studentId === w.student.id)).toBe(
      true
    );
    // Schema doc: voided rows "stay but are ignored".
    expect(rows.map((row: Body) => row.id)).not.toContain(attendanceId);
    expect(rows.some((row: Body) => row.eventId === event.id)).toBe(true);
  });

  it("every audited step is in the audit log with the right actor", async () => {
    const rows = await auditRows(w.academy, w.admin, {
      entityType: "attendance",
      entityId: attendanceId,
    });
    const byAction = new Map(rows.map((row: Body) => [row.action, row]));
    expect(byAction.get("attendance.verify")?.actorId).toBe(w.coach.id);
    expect(byAction.get("attendance.check_out")?.actorId).toBe(w.student.id);
    const voided = byAction.get("attendance.void");
    expect(voided?.actorId).toBe(w.admin.id);
    expect(voided?.reason).toBe("Photo of the code from home");
    // The second tick was unchanged, so only one verify row.
    expect(
      rows.filter((row: Body) => row.action === "attendance.verify")
    ).toHaveLength(1);
  });
});

describe("scan refusals, in the document's order", () => {
  let token: string;
  let event: Body;

  beforeAll(async () => {
    ({ token } = await getQrToken(w.academy, w.admin));
    event = await createOpenEvent(w.academy, w.admin, w.teamA);
  });

  const scanAs = (input: Record<string, unknown>, user = w.student2) =>
    scan(user, {
      token,
      eventId: event.id,
      sessionDate: today,
      ...input,
    });

  it("a forged token -> 401 invalid_code", async () => {
    const reply = await scanAs({ token: `${token.slice(0, -4)}AAAA` });
    expect(reply.status).toBe(401);
    expect(reply.body.error.code).toBe("invalid_code");
  });

  it("the deep link form of the code is accepted", async () => {
    const { deepLink } = await getQrToken(w.academy, w.admin);
    const other = await createOpenEvent(w.academy, w.admin, w.teamA);
    const reply = await scan(w.student2, {
      token: deepLink,
      eventId: other.id,
      sessionDate: today,
    });
    expect(reply.status, reply.text).toBe(201);
  });

  it("yesterday's date -> 404 session_not_found", async () => {
    const yesterdayEvent = await createOpenEvent(w.academy, w.admin, w.teamA, {
      startDate: today,
      endDate: undefined,
    });
    const reply = await scan(w.student2, {
      token,
      eventId: yesterdayEvent.id,
      sessionDate: "2001-01-01",
    });
    expect(reply.status).toBe(404);
    expect(reply.body.error.code).toBe("session_not_found");
  });

  it("an event that does not take attendance -> 404 session_not_found", async () => {
    const plain = await createEvent(w.academy, w.admin, {
      teamId: w.teamA,
      collectAttendance: false,
    });
    const reply = await scan(w.student2, {
      token,
      eventId: plain.id,
      sessionDate: today,
    });
    expect(reply.status).toBe(404);
    expect(reply.body.error.code).toBe("session_not_found");
  });

  it("outside the window -> 403 outside_window, even if also far away", async () => {
    const times = closedWindowTimes(w.academy.timezone);
    const closed = await createEvent(w.academy, w.admin, {
      teamId: w.teamA,
      collectAttendance: true,
      startTime: times.startTime,
      endTime: times.endTime,
    });
    const reply = await scan(w.student2, {
      token,
      eventId: closed.id,
      sessionDate: today,
      ...FAR,
    });
    expect(reply.status, reply.text).toBe(403);
    expect(reply.body.error.code).toBe("outside_window");
  });

  it("another team's session -> 403 not_on_team", async () => {
    const teamBEvent = await createOpenEvent(w.academy, w.admin, w.teamB);
    const reply = await scan(w.student2, {
      token,
      eventId: teamBEvent.id,
      sessionDate: today,
    });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("not_on_team");
  });

  it("mock location -> 403 mock_location (checked before accuracy and distance)", async () => {
    const reply = await scanAs({ isMocked: true, accuracyM: 500, ...FAR });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("mock_location");
  });

  it("accuracy worse than 100 m -> 422 location_imprecise (before distance)", async () => {
    const reply = await scanAs({ accuracyM: 101, ...FAR });
    expect(reply.status).toBe(422);
    expect(reply.body.error.code).toBe("location_imprecise");
  });

  it("too far -> 403 too_far with the distance", async () => {
    const reply = await scanAs({ ...FAR });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("too_far");
    expect(reply.body.error.details.distanceM).toBeGreaterThan(1000);
  });

  it("check-out before any check-in -> 409 not_checked_in", async () => {
    const reply = await scanAs({ action: "check_out", ...NEAR });
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("not_checked_in");
  });

  it("an academy-wide event is open to every student of the academy", async () => {
    const wide = await createOpenEvent(w.academy, w.admin, null);
    const reply = await scan(w.studentFree, {
      token,
      eventId: wide.id,
      sessionDate: today,
    });
    expect(reply.status, reply.text).toBe(201);
  });

  it("after regenerating, old prints stop working (AO-8)", async () => {
    const regen = await call("POST", w.academy.path("/academy-qr/regenerate"), {
      user: w.admin,
    });
    const fresh = expectStatus(regen, 200).token;
    expect(fresh).not.toBe(token);
    const stale = await scanAs({});
    expect(stale.status).toBe(401);
    expect(stale.body.error.code).toBe("invalid_code");
    const ok = await scan(w.student2, {
      token: fresh,
      eventId: event.id,
      sessionDate: today,
    });
    expect(ok.status, ok.text).toBe(201);
    const audit = await auditRows(w.academy, w.admin, {
      action: "academy_qr.regenerate",
    });
    expect(audit[0]?.actorId).toBe(w.admin.id);
  });
});

describe("ticks and manual entries", () => {
  it("untick works while the window is open and is audited", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.coach, event.id, [
      w.student2.id,
    ]);
    await call("POST", w.academy.path(`/attendance/${row.id}/verify`), {
      user: w.coach,
    });
    const reply = await call(
      "DELETE",
      w.academy.path(`/attendance/${row.id}/verify`),
      { user: w.coach }
    );
    expect(expectStatus(reply, 200).data.verifiedAt).toBeNull();
    const audit = await auditRows(w.academy, w.admin, { entityId: row.id });
    expect(audit.map((item: Body) => item.action)).toContain(
      "attendance.unverify"
    );
  });

  // Before 03:00 local there is no window today that has already closed.
  it.runIf(closedWindowTimes(ZONE_FAR_EAST).closed === "after")(
    "untick after the window closed -> 409",
    async () => {
      const times = closedWindowTimes(w.academy.timezone);
      const event = await createEvent(w.academy, w.admin, {
        teamId: w.teamA,
        collectAttendance: true,
        startTime: times.startTime,
        endTime: times.endTime,
      });
      const [row] = await recordAttendance(w.academy, w.coach, event.id, [
        w.student2.id,
      ]);
      await call("POST", w.academy.path(`/attendance/${row.id}/verify`), {
        user: w.coach,
      });
      const reply = await call(
        "DELETE",
        w.academy.path(`/attendance/${row.id}/verify`),
        { user: w.coach }
      );
      expect(reply.status, reply.text).toBe(409);
    }
  );

  it("bulk tick returns a result per id", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const rows = await recordAttendance(w.academy, w.coach, event.id, [
      w.student.id,
      w.student2.id,
    ]);
    const teamBEvent = await createOpenEvent(w.academy, w.admin, w.teamB);
    const [other] = await recordAttendance(w.academy, w.coachB, teamBEvent.id, [
      w.studentB.id,
    ]);
    const reply = await call("POST", w.academy.path("/attendance/verify"), {
      user: w.coach,
      body: { ids: [rows[0].id, rows[1].id, other.id, "no-such-id"] },
    });
    const results = expectStatus(reply, 200).data;
    expect(results.map((item: Body) => item.result)).toEqual([
      "verified",
      "verified",
      "not_found",
      "not_found",
    ]);
  });

  it("manual check-out sets checkOutAt once; no check-in -> 422", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [present] = await recordAttendance(w.academy, w.coach, event.id, [
      w.student.id,
    ]);
    const first = await call(
      "POST",
      w.academy.path(`/attendance/${present.id}/check-out`),
      { user: w.coach }
    );
    expect(expectStatus(first, 200).data.checkOutAt).not.toBeNull();
    const second = await call(
      "POST",
      w.academy.path(`/attendance/${present.id}/check-out`),
      { user: w.coach }
    );
    expect(second.status).toBe(409);
    const [absent] = await recordAttendance(
      w.academy,
      w.coach,
      event.id,
      [w.student2.id],
      { status: "absent" }
    );
    const none = await call(
      "POST",
      w.academy.path(`/attendance/${absent.id}/check-out`),
      { user: w.coach }
    );
    expect(none.status).toBe(422);
  });

  it("a duplicate manual entry for the same session -> 409", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    await recordAttendance(w.academy, w.coach, event.id, [w.student2.id]);
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.coach2,
      idempotencyKey: true,
      body: {
        eventId: event.id,
        sessionDate: today,
        entries: [{ studentId: w.student2.id, status: "present" }],
      },
    });
    expect(reply.status).toBe(409);
  });

  it("an absent row recorded by the coach blocks a later QR check-in", async () => {
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    await recordAttendance(w.academy, w.coach, event.id, [w.student.id], {
      status: "absent",
    });
    const { token } = await getQrToken(w.academy, w.admin);
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: localNow(w.academy.timezone).date,
    });
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("already_checked_in");
  });
});
