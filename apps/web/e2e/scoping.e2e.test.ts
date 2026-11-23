/**
 * Scoping and isolation (schema doc, Rules: Scoping; API endpoints,
 * Conventions check 4): two academies, two teams. A coach sees only their
 * teams' students, a student only their own rows, and nothing crosses
 * academies, even for someone in both, even when ids are guessed.
 */
import { beforeAll, describe, expect, it } from "vitest";

import { type Body, call, type User } from "./helpers/http";
import {
  buildWorld,
  createOpenEvent,
  createRecord,
  expectStatus,
  getQrToken,
  recordAttendance,
  recordBody,
  recordFee,
  scan,
  todayIn,
  type World,
} from "./helpers/world";

let w: World;
let today: string;
/** Ids of rows about each student, by label. */
const rows = {
  attendance: {} as Record<string, string>,
  fee: {} as Record<string, string>,
  record: {} as Record<string, string>,
};
let teamAEvent: Body;
let teamBEvent: Body;
let otherEvent: Body;

const ids = (body: Body): string[] => body.data.map((row: Body) => row.id);

const get = async (user: User, path: string): Promise<Body> =>
  expectStatus(await call("GET", path, { user }), 200);

beforeAll(async () => {
  w = await buildWorld();
  today = todayIn(w.academy);
  teamAEvent = await createOpenEvent(w.academy, w.admin, w.teamA);
  teamBEvent = await createOpenEvent(w.academy, w.admin, w.teamB);
  const [a1, a2, dualA] = await recordAttendance(
    w.academy,
    w.admin,
    teamAEvent.id,
    [w.student.id, w.student2.id, w.dual.id]
  );
  const [b1] = await recordAttendance(w.academy, w.admin, teamBEvent.id, [
    w.studentB.id,
  ]);
  rows.attendance = {
    student: a1.id,
    student2: a2.id,
    dualA: dualA.id,
    studentB: b1.id,
  };
  otherEvent = await createOpenEvent(
    w.other.academy,
    w.other.admin,
    w.other.teamX
  );
  const [x1, dualX] = await recordAttendance(
    w.other.academy,
    w.other.admin,
    otherEvent.id,
    [w.other.student.id, w.dual.id]
  );
  rows.attendance.otherStudent = x1.id;
  rows.attendance.dualX = dualX.id;

  for (const [label, user] of [
    ["student", w.student],
    ["student2", w.student2],
    ["studentB", w.studentB],
    ["dualA", w.dual],
  ] as const) {
    rows.fee[label] = (await recordFee(w.academy, w.admin, user.id)).id;
    rows.record[label] = (
      await createRecord(w.academy, w.admin, user.id, "athletic")
    ).id;
  }
  rows.fee.otherStudent = (
    await recordFee(w.other.academy, w.other.admin, w.other.student.id)
  ).id;
  rows.fee.dualX = (
    await recordFee(w.other.academy, w.other.admin, w.dual.id)
  ).id;
  rows.record.otherStudent = (
    await createRecord(
      w.other.academy,
      w.other.admin,
      w.other.student.id,
      "athletic"
    )
  ).id;
});

describe("a coach sees and changes only their own teams' students", () => {
  it("GET /attendance lists team A only", async () => {
    const body = await get(w.coach, w.academy.path("/attendance?limit=200"));
    expect(ids(body)).toEqual(
      expect.arrayContaining([
        rows.attendance.student,
        rows.attendance.student2,
      ])
    );
    expect(ids(body)).not.toContain(rows.attendance.studentB);
    expect(body.data.every((row: Body) => row.academyId === w.academy.id)).toBe(
      true
    );
  });

  it("a studentId filter for another team's student returns nothing", async () => {
    const body = await get(
      w.coach,
      w.academy.path(`/attendance?studentId=${w.studentB.id}`)
    );
    expect(body.data).toEqual([]);
  });

  it("guessing team B's attendance id: read, tick, check out, bulk tick -> 404 / not_found", async () => {
    const id = rows.attendance.studentB;
    const read = await call("GET", w.academy.path(`/attendance/${id}`), {
      user: w.coach,
    });
    expect(read.status).toBe(404);
    for (const action of ["verify", "check-out"]) {
      const reply = await call(
        "POST",
        w.academy.path(`/attendance/${id}/${action}`),
        { user: w.coach }
      );
      expect(reply.status, `${action}: ${reply.text}`).toBe(404);
    }
    const bulk = await call("POST", w.academy.path("/attendance/verify"), {
      user: w.coach,
      body: { ids: [id] },
    });
    expect(expectStatus(bulk, 200).data[0].result).toBe("not_found");
  });

  it("recording attendance at team B's event -> 403", async () => {
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.coach,
      idempotencyKey: true,
      body: {
        eventId: teamBEvent.id,
        sessionDate: today,
        entries: [{ studentId: w.studentB.id, status: "present" }],
      },
    });
    expect(reply.status).toBe(403);
  });

  it("recording team B's student at team A's event -> 422 student_not_on_team", async () => {
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.coach,
      idempotencyKey: true,
      body: {
        eventId: teamAEvent.id,
        sessionDate: today,
        entries: [{ studentId: w.studentB.id, status: "present" }],
      },
    });
    expect(reply.status).toBe(422);
  });

  it("academy-wide event: a coach records only their own students", async () => {
    const wide = await createOpenEvent(w.academy, w.admin, null);
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.coach,
      idempotencyKey: true,
      body: {
        eventId: wide.id,
        sessionDate: today,
        entries: [{ studentId: w.studentB.id, status: "present" }],
      },
    });
    expect(reply.status).toBe(403);
  });

  it("fees: list, one row, team filter and outstanding stay inside team A", async () => {
    const list = await get(w.coach, w.academy.path("/fees?limit=200"));
    expect(ids(list)).toContain(rows.fee.student);
    expect(ids(list)).not.toContain(rows.fee.studentB);
    const one = await call(
      "GET",
      w.academy.path(`/fees/${rows.fee.studentB}`),
      {
        user: w.coach,
      }
    );
    expect(one.status).toBe(404);
    const filtered = await call(
      "GET",
      w.academy.path(`/fees?teamId=${w.teamB}`),
      { user: w.coach }
    );
    expect(filtered.status).toBe(404);
    const outstanding = await get(
      w.coach,
      w.academy.path("/fees/outstanding?limit=200")
    );
    const students = outstanding.data.map((row: Body) => row.student.id);
    expect(students).not.toContain(w.studentB.id);
    expect(students).not.toContain(w.studentFree.id);
  });

  it("records: another team's student is invisible", async () => {
    const list = await call(
      "GET",
      w.academy.path(`/students/${w.studentB.id}/records`),
      { user: w.coach }
    );
    expect(list.status).toBe(404);
    const one = await call(
      "GET",
      w.academy.path(`/records/${rows.record.studentB}`),
      { user: w.coach }
    );
    expect(one.status).toBe(404);
    const verify = await call(
      "POST",
      w.academy.path(`/records/${rows.record.studentB}/verify`),
      { user: w.coach }
    );
    expect(verify.status).toBe(404);
    const create = await call(
      "POST",
      w.academy.path(`/students/${w.studentB.id}/records`),
      { user: w.coach, body: recordBody(w.academy, "athletic") }
    );
    expect(create.status).toBe(404);
    const queue = await get(w.coach, w.academy.path("/records?limit=200"));
    expect(ids(queue)).not.toContain(rows.record.studentB);
  });

  it("events: team B's events are hidden and cannot be changed", async () => {
    const list = await get(
      w.coach,
      w.academy.path(`/events?from=${today}&to=${today}&limit=200`)
    );
    expect(ids(list)).toContain(teamAEvent.id);
    expect(ids(list)).not.toContain(teamBEvent.id);
    for (const [method, suffix] of [
      ["GET", ""],
      ["PATCH", ""],
      ["DELETE", ""],
      ["GET", "/sessions"],
      ["POST", `/sessions/${today}/cancel`],
    ] as const) {
      const reply = await call(
        method,
        w.academy.path(`/events/${teamBEvent.id}${suffix}`),
        {
          user: w.coach,
          body: method === "PATCH" ? { title: "mine now" } : undefined,
        }
      );
      expect(reply.status, `${method} ${suffix}: ${reply.text}`).toBe(404);
    }
    const filter = await call(
      "GET",
      w.academy.path(`/events?from=${today}&to=${today}&teamId=${w.teamB}`),
      { user: w.coach }
    );
    expect(filter.status).toBe(403);
    const create = await call("POST", w.academy.path("/events"), {
      user: w.coach,
      body: {
        title: "Sneaky",
        eventType: "training",
        startDate: today,
        teamId: w.teamB,
      },
    });
    expect(create.status).toBe(403);
    const wide = await call("POST", w.academy.path("/events"), {
      user: w.coach,
      body: { title: "Everyone", eventType: "training", startDate: today },
    });
    expect(wide.status).toBe(403);
  });

  it("team B's attendance summary -> 403", async () => {
    const reply = await call(
      "GET",
      w.academy.path(
        `/teams/${w.teamB}/attendance-summary?from=${today}&to=${today}`
      ),
      { user: w.coach }
    );
    expect(reply.status).toBe(403);
  });
});

describe("a student sees only their own rows", () => {
  it("/me/attendance and /fees and records are only theirs", async () => {
    const mine = await get(
      w.student,
      `/api/v1/me/attendance?academyId=${w.academy.id}`
    );
    expect(ids(mine)).toEqual([rows.attendance.student]);
    const fees = await get(w.student, w.academy.path("/fees?limit=200"));
    expect(ids(fees)).toEqual([rows.fee.student]);
    const meFees = await get(
      w.student,
      `/api/v1/me/fees?academyId=${w.academy.id}`
    );
    expect(ids(meFees)).toEqual([rows.fee.student]);
  });

  it("guessed ids of a teammate's rows -> 404", async () => {
    const paths = [
      `/fees/${rows.fee.student2}`,
      `/records/${rows.record.student2}`,
      `/students/${w.student2.id}/records`,
    ];
    for (const path of paths) {
      const reply = await call("GET", w.academy.path(path), {
        user: w.student,
      });
      expect(reply.status, `${path}: ${reply.text}`).toBe(404);
    }
  });

  it("cannot upload a record for a teammate -> 404", async () => {
    const reply = await call(
      "POST",
      w.academy.path(`/students/${w.student2.id}/records`),
      { user: w.student, body: recordBody(w.academy, "academic") }
    );
    expect(reply.status).toBe(404);
  });

  it("cannot edit or delete someone else's pending record about them", async () => {
    const byCoach = await createRecord(
      w.academy,
      w.coach,
      w.student.id,
      "athletic"
    );
    const patch = await call(
      "PATCH",
      w.academy.path(`/records/${byCoach.id}`),
      {
        user: w.student,
        body: { recordedOn: today },
      }
    );
    expect(patch.status).toBe(403);
    const remove = await call(
      "DELETE",
      w.academy.path(`/records/${byCoach.id}`),
      { user: w.student }
    );
    expect(remove.status).toBe(403);
  });

  it("team B's event is hidden, and its scan says not_on_team", async () => {
    const list = await get(
      w.student,
      w.academy.path(`/events?from=${today}&to=${today}&limit=200`)
    );
    expect(ids(list)).not.toContain(teamBEvent.id);
    const one = await call("GET", w.academy.path(`/events/${teamBEvent.id}`), {
      user: w.student,
    });
    expect(one.status).toBe(404);
    const { token } = await getQrToken(w.academy, w.admin);
    const reply = await scan(w.student, {
      token,
      eventId: teamBEvent.id,
      sessionDate: today,
    });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("not_on_team");
  });
});

describe("nothing crosses academies", () => {
  it("ids from academy B on academy A's paths -> 404, even for A's admin", async () => {
    const paths = [
      `/attendance/${rows.attendance.otherStudent}`,
      `/fees/${rows.fee.otherStudent}`,
      `/records/${rows.record.otherStudent}`,
      `/events/${otherEvent.id}`,
      `/teams/${w.other.teamX}/attendance-summary?from=${today}&to=${today}`,
    ];
    for (const path of paths) {
      const reply = await call("GET", w.academy.path(path), { user: w.admin });
      expect(reply.status, `${path}: ${reply.text}`).toBe(404);
    }
    const voidFee = await call(
      "POST",
      w.academy.path(`/fees/${rows.fee.otherStudent}/void`),
      { user: w.admin, body: { reason: "cross" } }
    );
    expect(voidFee.status).toBe(404);
    const voidAttendance = await call(
      "POST",
      w.academy.path(`/attendance/${rows.attendance.otherStudent}/void`),
      { user: w.admin, body: { reason: "cross" } }
    );
    expect(voidAttendance.status).toBe(404);
  });

  // Was KNOWN DEFECT D4 (fixed in round 3): GET /students/:studentId/records answers 200 with an
  // empty page for any id (another academy's student, a coach, a made-up
  // id) when the caller is an academy admin. No rows leak, but the README's
  // rule "a single row outside the caller's scope -> 404" and POST's own
  // 404 for the same id are not followed.
  it("FIXED D4: another academy's student's record list -> 404", async () => {
    for (const id of [w.other.student.id, w.coach.id, "no-such-user"]) {
      const reply = await call(
        "GET",
        w.academy.path(`/students/${id}/records`),
        { user: w.admin }
      );
      expect(reply.status, `${id}: ${reply.text}`).toBe(404);
    }
  });

  it("A's admin on B's routes -> 404", async () => {
    const reply = await call("GET", w.other.academy.path("/dashboard"), {
      user: w.admin,
    });
    expect(reply.status).toBe(404);
  });

  it("A's admin cannot record attendance at B's event through A's path", async () => {
    const reply = await call("POST", w.academy.path("/attendance"), {
      user: w.admin,
      idempotencyKey: true,
      body: {
        eventId: otherEvent.id,
        sessionDate: todayIn(w.other.academy),
        entries: [{ studentId: w.student.id, status: "present" }],
      },
    });
    expect(reply.status).toBe(404);
  });

  it("the student in both academies gets each academy's rows only", async () => {
    const inA = await get(
      w.dual,
      `/api/v1/me/attendance?academyId=${w.academy.id}`
    );
    expect(ids(inA)).toEqual([rows.attendance.dualA]);
    const inB = await get(
      w.dual,
      `/api/v1/me/attendance?academyId=${w.other.academy.id}`
    );
    expect(ids(inB)).toEqual([rows.attendance.dualX]);
    const feesA = await get(
      w.dual,
      `/api/v1/me/fees?academyId=${w.academy.id}`
    );
    expect(ids(feesA)).toEqual([rows.fee.dualA]);
    const listA = await get(w.dual, w.academy.path("/fees"));
    expect(ids(listA)).toEqual([rows.fee.dualA]);
    const crossed = await call(
      "GET",
      w.academy.path(`/fees/${rows.fee.dualX}`),
      {
        user: w.dual,
      }
    );
    expect(crossed.status).toBe(404);
  });

  it("A's admin lists never include B's rows", async () => {
    const attendance = await get(
      w.admin,
      w.academy.path("/attendance?limit=200")
    );
    expect(ids(attendance)).not.toContain(rows.attendance.dualX);
    expect(ids(attendance)).not.toContain(rows.attendance.otherStudent);
    const fees = await get(w.admin, w.academy.path("/fees?limit=200"));
    expect(ids(fees)).not.toContain(rows.fee.dualX);
    const audit = await get(w.admin, w.academy.path("/audit-log?limit=200"));
    expect(
      audit.data.every((row: Body) => row.academyId === w.academy.id)
    ).toBe(true);
  });

  it("academy B's QR token with academy A's event -> 404 session_not_found", async () => {
    const { token } = await getQrToken(w.other.academy, w.other.admin);
    const reply = await scan(w.dual, {
      token,
      eventId: teamAEvent.id,
      sessionDate: today,
    });
    expect(reply.status).toBe(404);
    expect(reply.body.error.code).toBe("session_not_found");
  });

  it("academy A's student scanning academy B's session -> 403 not_on_team", async () => {
    const { token } = await getQrToken(w.other.academy, w.other.admin);
    const event = await createOpenEvent(w.other.academy, w.other.admin, null);
    const reply = await scan(w.student, {
      token,
      eventId: event.id,
      sessionDate: todayIn(w.other.academy),
    });
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("not_on_team");
  });
});
