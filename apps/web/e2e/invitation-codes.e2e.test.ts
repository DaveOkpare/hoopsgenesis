/**
 * Open invitation codes and invitation privacy (round four), tested as an
 * attacker would: the join journey, limits under concurrency, who can see a
 * code value, escalation and isolation, guessing, input variants and what
 * preview reveals.
 *
 * Codes: 12 characters from 23456789ABCDEFGHJKMNPQRSTVWXYZ, shown as
 * XXXX-XXXX-XXXX, accepted in any case with or without dashes or spaces.
 */
import { randomInt } from "node:crypto";

import { beforeAll, describe, expect, it } from "vitest";

import {
  authCall,
  authGet,
  type Body,
  call,
  isErrorEnvelope,
  type Reply,
  signUp,
  type User,
} from "./helpers/http";
import { db, setPlatformRole } from "./helpers/seed";
import {
  auditRows,
  buildWorld,
  createOpenEvent,
  createRecord,
  expectStatus,
  recordAttendance,
  recordFee,
  todayIn,
  type World,
} from "./helpers/world";

const ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
const CODE_LENGTH = 12;
const DISPLAY_PATTERN =
  /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const PARALLEL_USERS = 8;
const PARALLEL_LIMIT = 3;
const GUESSES = 25;

let w: World;
let owner: User;

/** Every code value issued in this file, raw (no dashes). */
const issued: string[] = [];
/** Raw values of admin-role codes (must never reach an academy admin). */
const adminIssued: string[] = [];

const raw = (display: string): string => display.replaceAll("-", "");

const codesPath = (academyId: string, rest = ""): string =>
  `/api/v1/academies/${academyId}/invitation-codes${rest}`;
const ownerCodesPath = (academyId: string, rest = ""): string =>
  `/api/v1/admin/academies/${academyId}/invitation-codes${rest}`;

const remember = (code: Body): Body => {
  issued.push(raw(code.code));
  if (code.role === "admin") {
    adminIssued.push(raw(code.code));
  }
  return code;
};

const createCode = async (
  by: User,
  body: Record<string, unknown>,
  academyId = w.academy.id
): Promise<Body> => {
  const path = by === owner ? ownerCodesPath(academyId) : codesPath(academyId);
  return remember(
    expectStatus(await call("POST", path, { user: by, body }), 201).data
  );
};

const preview = (user: User | null, code: unknown): Promise<Reply> =>
  call("POST", "/api/v1/invitation-codes/preview", {
    user,
    body: { code },
  });

const redeem = (user: User | null, code: unknown): Promise<Reply> =>
  call("POST", "/api/v1/invitation-codes/redeem", {
    user,
    body: { code },
  });

const memberRole = async (
  userId: string,
  academyId = w.academy.id
): Promise<string | null> =>
  (
    await db().member.findUnique({
      where: { organizationId_userId: { organizationId: academyId, userId } },
      select: { role: true },
    })
  )?.role ?? null;

const teamsOf = async (userId: string): Promise<string[]> =>
  (
    await db().teamMember.findMany({
      where: { userId },
      select: { teamId: true },
    })
  )
    .map((row) => row.teamId)
    .sort();

const useCount = async (id: string): Promise<number> =>
  (
    await db().invitationCode.findUniqueOrThrow({
      where: { id },
      select: { useCount: true },
    })
  ).useCount;

/** A valid-looking code that was never issued (alphabet, right length). */
const randomCode = (): string =>
  Array.from(
    { length: CODE_LENGTH },
    () => ALPHABET[randomInt(ALPHABET.length)]
  ).join("");

/** The real code with its last character changed to another valid one. */
const nearMiss = (code: string): string => {
  const plain = raw(code);
  const last = plain.at(-1) ?? "2";
  const other = ALPHABET[(ALPHABET.indexOf(last) + 1) % ALPHABET.length];
  return `${plain.slice(0, -1)}${other}`;
};

/** No issued code value, with or without dashes, in `text`. */
const expectNoCodes = (text: string, where: string, codes = issued): void => {
  for (const value of codes) {
    const display = value.match(/.{4}/g)?.join("-") ?? value;
    expect(text, `${where} leaks a code`).not.toContain(value);
    expect(text, `${where} leaks a code`).not.toContain(display);
    expect(text.toUpperCase(), `${where} leaks a code`).not.toContain(value);
  }
};

beforeAll(async () => {
  w = await buildWorld();
  owner = await signUp("owner");
  await setPlatformRole(owner.id, "admin");
});

describe("the join journey", () => {
  it("student code for team A: sign up, preview, redeem, then act as a student on team A", async () => {
    const code = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
    });
    expect(code.code).toMatch(DISPLAY_PATTERN);
    expect(code.status).toBe("active");
    expect(code.maxUses).toBe(1);
    expect(code.team.id).toBe(w.teamA);
    const joiner = await signUp("joiner");
    const seen = expectStatus(await preview(joiner, code.code), 200).data;
    expect(seen.academy.id).toBe(w.academy.id);
    expect(seen.role).toBe("student");
    expect(seen.team.id).toBe(w.teamA);
    expect(seen.alreadyMember).toBe(false);
    const joined = expectStatus(await redeem(joiner, code.code), 201).data;
    expect(joined.member.roles).toEqual(["student"]);
    expect(joined.team.id).toBe(w.teamA);
    expect(await memberRole(joiner.id)).toBe("student");

    // Passes the academy routes as a student on team A.
    const teams = expectStatus(
      await call("GET", w.academy.path("/teams"), { user: joiner }),
      200
    ).data;
    expect(teams.map((team: Body) => team.id)).toEqual([w.teamA]);
    const me = await call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
      user: joiner,
    });
    expect(me.status).toBe(200);
    const dash = await call("GET", w.academy.path("/dashboard"), {
      user: joiner,
    });
    expect(dash.status).toBe(403);
    // In the roster, and the coach can now record their attendance.
    const roster = expectStatus(
      await call("GET", w.academy.path(`/teams/${w.teamA}/members`), {
        user: w.coach,
      }),
      200
    ).data;
    expect(roster.map((entry: Body) => entry.userId)).toContain(joiner.id);
    const event = await createOpenEvent(w.academy, w.admin, w.teamA);
    const [row] = await recordAttendance(w.academy, w.coach, event.id, [
      joiner.id,
    ]);
    expect(row.studentId).toBe(joiner.id);

    // The join is audited, by the joiner, with a fingerprint only.
    const audit = await auditRows(w.academy, w.admin, { actorId: joiner.id });
    const actions = audit.map((entry: Body) => entry.action).sort();
    expect(actions).toEqual(["member.join_by_code", "team.member_add"]);
    const join = audit.find(
      (entry: Body) => entry.action === "member.join_by_code"
    );
    expect(join.after.codeFingerprint).toBeTypeOf("string");
    expectNoCodes(JSON.stringify(audit), "join audit");

    // Single use: the code is now used up.
    const late = await redeem(await signUp("late"), code.code);
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe("code_used_up");
  });

  it("coach code for team A: the new coach sees team A's students", async () => {
    const code = await createCode(w.admin, { role: "coach", teamId: w.teamA });
    const joiner = await signUp("new-coach");
    expectStatus(await redeem(joiner, code.code), 201);
    expect(await memberRole(joiner.id)).toBe("coach");
    expect(await teamsOf(joiner.id)).toEqual([w.teamA]);
    const list = await call(
      "GET",
      w.academy.path(`/students/${w.student.id}/records`),
      {
        user: joiner,
      }
    );
    expect(list.status).toBe(200);
    const other = await call(
      "GET",
      w.academy.path(`/students/${w.studentB.id}/records`),
      {
        user: joiner,
      }
    );
    expect(other.status).toBe(404);
  });

  it("owner-issued admin code: the joiner becomes an academy admin", async () => {
    const code = await createCode(owner, { role: "admin" }, w.other.academy.id);
    expect(code.maxUses).toBe(1);
    expect(Date.parse(code.expiresAt) - Date.now()).toBeLessThanOrEqual(
      72 * HOUR
    );
    const joiner = await signUp("new-admin");
    expectStatus(await redeem(joiner, code.code), 201);
    expect(await memberRole(joiner.id, w.other.academy.id)).toBe("admin");
    const dash = await call("GET", w.other.academy.path("/dashboard"), {
      user: joiner,
    });
    expect(dash.status).toBe(200);
  });

  it("an academy-wide student code (no team) joins with no team", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const joiner = await signUp("teamless");
    const joined = expectStatus(await redeem(joiner, code.code), 201).data;
    expect(joined.team).toBeNull();
    expect(await teamsOf(joiner.id)).toEqual([]);
  });
});

describe("who manages codes", () => {
  it("coach and student 403, non-member and owner (on the academy route) 404, no session 401", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const paths: [string, string, unknown?][] = [
      ["POST", codesPath(w.academy.id), { role: "student" }],
      ["GET", codesPath(w.academy.id)],
      ["GET", codesPath(w.academy.id, `/${code.id}`)],
      ["POST", codesPath(w.academy.id, `/${code.id}/revoke`), {}],
    ];
    const cases: [User | null, number][] = [
      [null, 401],
      [w.coach, 403],
      [w.student, 403],
      [w.outsider, 404],
      [owner, 404],
    ];
    for (const [user, status] of cases) {
      for (const [method, path, body] of paths) {
        const reply = await call(method, path, { user, body });
        expect(
          reply.status,
          `${user?.label ?? "anonymous"} ${method} ${path}`
        ).toBe(status);
        expectNoCodes(reply.text, `${method} ${path}`);
      }
    }
    // The owner routes: academy admin and below 403.
    for (const user of [w.admin, w.coach, w.student]) {
      const reply = await call("GET", ownerCodesPath(w.academy.id), { user });
      expect(reply.status, user.label).toBe(403);
    }
    expect(
      (await call("GET", ownerCodesPath(crypto.randomUUID()), { user: owner }))
        .status
    ).toBe(404);
  });

  it("an academy admin cannot create admin codes or use another academy's team", async () => {
    const admin = await call("POST", codesPath(w.academy.id), {
      user: w.admin,
      body: { role: "admin" },
    });
    expect(admin.status).toBe(403);
    expect(admin.body.error.code).toBe("admin_codes_owner_only");
    const foreignTeam = await call("POST", codesPath(w.academy.id), {
      user: w.admin,
      body: { role: "student", teamId: w.other.teamX },
    });
    expect(foreignTeam.status).toBe(404);
    for (const role of ["owner", "member", "coach,admin", ["admin"]]) {
      const reply = await call("POST", codesPath(w.academy.id), {
        user: w.admin,
        body: { role },
      });
      expect(reply.status, JSON.stringify(role)).toBe(400);
    }
  });

  it("admin codes are invisible to academy admins: not listed, 404 by id, no revoke", async () => {
    const code = await createCode(owner, { role: "admin" });
    const list = expectStatus(
      await call("GET", codesPath(w.academy.id, "?limit=200"), {
        user: w.admin,
      }),
      200
    ).data;
    expect(list.map((row: Body) => row.id)).not.toContain(code.id);
    expect(list.every((row: Body) => row.role !== "admin")).toBe(true);
    const byId = await call("GET", codesPath(w.academy.id, `/${code.id}`), {
      user: w.admin,
    });
    expect(byId.status).toBe(404);
    const revoke = await call(
      "POST",
      codesPath(w.academy.id, `/${code.id}/revoke`),
      {
        user: w.admin,
        body: {},
      }
    );
    expect(revoke.status).toBe(404);
    // The owner sees it.
    const ownerList = expectStatus(
      await call("GET", ownerCodesPath(w.academy.id, "?limit=200"), {
        user: owner,
      }),
      200
    ).data;
    expect(ownerList.map((row: Body) => row.id)).toContain(code.id);
  });
});

describe("limits and validation", () => {
  it.each<[Record<string, unknown>, string]>([
    [{ maxUses: 0 }, "maxUses 0"],
    [{ maxUses: 1001 }, "maxUses 1001"],
    [{ maxUses: 1.5 }, "maxUses 1.5"],
    [{ maxUses: "3" }, "maxUses as a string"],
    [{ expiresAt: null }, "expiresAt null (no expiry)"],
    [
      { expiresAt: new Date(Date.now() - 1000).toISOString() },
      "expiresAt in the past",
    ],
    [{ expiresAt: new Date(Date.now() + 91 * DAY).toISOString() }, "91 days"],
    [{ maxUses: null, expiresAt: null }, "no limit and no expiry"],
    [{ extra: 1 }, "an unknown key"],
  ])("%j (%s) -> 400", async (extra: Record<string, unknown>) => {
    const reply = await call("POST", codesPath(w.academy.id), {
      user: w.admin,
      body: { role: "student", ...extra },
    });
    expect(reply.status, reply.text).toBe(400);
  });

  it("unlimited uses still expire (default 7 days); 90 days is the most", async () => {
    const unlimited = await createCode(w.admin, {
      role: "student",
      maxUses: null,
    });
    expect(unlimited.maxUses).toBeNull();
    const lifetime =
      Date.parse(unlimited.expiresAt) - Date.parse(unlimited.createdAt);
    expect(Math.abs(lifetime - 7 * DAY)).toBeLessThan(60_000);
    const longest = await createCode(w.admin, {
      role: "student",
      expiresAt: new Date(Date.now() + 90 * DAY - 60_000).toISOString(),
    });
    expect(longest.status).toBe("active");
  });

  it.each<[Record<string, unknown>, string]>([
    [{ maxUses: 2 }, "two uses"],
    [{ maxUses: null }, "unlimited"],
    [{ teamId: "TEAM" }, "a team"],
    [{ expiresAt: new Date(Date.now() + 73 * HOUR).toISOString() }, "73 hours"],
  ])(
    "owner admin code with %j (%s) -> 400",
    async (extra: Record<string, unknown>) => {
      const body: Record<string, unknown> = { role: "admin", ...extra };
      if (body.teamId === "TEAM") {
        body.teamId = w.teamA;
      }
      const reply = await call("POST", ownerCodesPath(w.academy.id), {
        user: owner,
        body,
      });
      expect(reply.status, reply.text).toBe(400);
    }
  );

  it(`a limit of ${PARALLEL_LIMIT} with ${PARALLEL_USERS} users redeeming at once: exactly ${PARALLEL_LIMIT} join`, async () => {
    const code = await createCode(w.admin, {
      role: "student",
      maxUses: PARALLEL_LIMIT,
    });
    const users = await Promise.all(
      Array.from({ length: PARALLEL_USERS }, (_, index) =>
        signUp(`rush${index}`)
      )
    );
    const replies = await Promise.all(
      users.map((user) => redeem(user, code.code))
    );
    const ok = replies.filter((reply) => reply.status === 201);
    expect(ok).toHaveLength(PARALLEL_LIMIT);
    for (const reply of replies.filter((item) => item.status !== 201)) {
      expect(reply.status, reply.text).toBe(410);
      expect(reply.body.error.code).toBe("code_used_up");
    }
    expect(await useCount(code.id)).toBe(PARALLEL_LIMIT);
    const members = await db().member.count({
      where: {
        organizationId: w.academy.id,
        userId: { in: users.map((u) => u.id) },
      },
    });
    expect(members).toBe(PARALLEL_LIMIT);
  });

  it("one user redeeming the same code in parallel joins once and uses one use", async () => {
    const code = await createCode(w.admin, { role: "student", maxUses: 5 });
    const user = await signUp("double-tap");
    const replies = await Promise.all(
      Array.from({ length: 6 }, () => redeem(user, code.code))
    );
    expect(replies.filter((reply) => reply.status === 201)).toHaveLength(1);
    for (const reply of replies.filter((item) => item.status !== 201)) {
      expect(reply.status, reply.text).toBe(409);
    }
    expect(await useCount(code.id)).toBe(1);
  });

  it("expiry boundary: works just before, 410 code_expired just after", async () => {
    const code = await createCode(w.admin, {
      role: "student",
      maxUses: null,
      expiresAt: new Date(Date.now() + 4000).toISOString(),
    });
    expectStatus(await redeem(await signUp("in-time"), code.code), 201);
    await new Promise((resolve) => setTimeout(resolve, 4500));
    const late = await redeem(await signUp("too-late"), code.code);
    expect(late.status).toBe(410);
    expect(late.body.error.code).toBe("code_expired");
    const {
      data: { status },
    } = expectStatus(
      await call("GET", codesPath(w.academy.id, `/${code.id}`), {
        user: w.admin,
      }),
      200
    );
    expect(status).toBe("expired");
  });

  it("revoke, then redeem or preview -> 410 code_revoked; revoke twice -> 409", async () => {
    const code = await createCode(w.admin, { role: "student", maxUses: null });
    const first = await signUp("before-revoke");
    expectStatus(await redeem(first, code.code), 201);
    const revoke = await call(
      "POST",
      codesPath(w.academy.id, `/${code.id}/revoke`),
      {
        user: w.admin,
        body: { reason: "Posted publicly" },
      }
    );
    expect(expectStatus(revoke, 200).data.status).toBe("revoked");
    for (const send of [redeem, preview]) {
      const reply = await send(await signUp("after-revoke"), code.code);
      expect(reply.status).toBe(410);
      expect(reply.body.error.code).toBe("code_revoked");
    }
    const again = await call(
      "POST",
      codesPath(w.academy.id, `/${code.id}/revoke`),
      {
        user: w.admin,
        body: {},
      }
    );
    expect(again.status).toBe(409);
    // The earlier joiner keeps their membership.
    expect(await memberRole(first.id)).toBe("student");
    const audit = await auditRows(w.academy, w.admin, { entityId: code.id });
    expect(audit.map((row: Body) => row.action).sort()).toEqual([
      "invitation_code.create",
      "invitation_code.revoke",
    ]);
    expectNoCodes(JSON.stringify(audit), "code audit rows");
  });
});

describe("abuse", () => {
  it("a student redeeming a coach code for their own academy: 409 already_member, nothing changes", async () => {
    const code = await createCode(w.admin, {
      role: "coach",
      teamId: w.teamB,
      maxUses: 2,
    });
    const before = await teamsOf(w.student.id);
    const reply = await redeem(w.student, code.code);
    expect(reply.status).toBe(409);
    expect(reply.body.error.code).toBe("already_member");
    expect(await memberRole(w.student.id)).toBe("student");
    expect(await teamsOf(w.student.id)).toEqual(before);
    expect(await useCount(code.id)).toBe(0);
  });

  it("a coach redeeming an owner-issued admin code for their own academy: no promotion", async () => {
    const code = await createCode(owner, { role: "admin" });
    const reply = await redeem(w.coach, code.code);
    expect(reply.status).toBe(409);
    expect(await memberRole(w.coach.id)).toBe("coach");
    expect(await useCount(code.id)).toBe(0);
  });

  it("a platform admin cannot redeem: 403 platform_admin_cannot_be_member", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const reply = await redeem(owner, code.code);
    expect(reply.status).toBe(403);
    expect(reply.body.error.code).toBe("platform_admin_cannot_be_member");
    expect(await memberRole(owner.id)).toBeNull();
    expect(await useCount(code.id)).toBe(0);
  });

  it("a member of academy A joins academy B by B's code and stays isolated", async () => {
    const code = await createCode(
      w.other.admin,
      {
        role: "student",
        teamId: w.other.teamX,
      },
      w.other.academy.id
    );
    expectStatus(await redeem(w.student2, code.code), 201);
    expect(await memberRole(w.student2.id, w.other.academy.id)).toBe("student");
    expect(await memberRole(w.student2.id)).toBe("student");
    const feeB = await recordFee(w.other.academy, w.other.admin, w.student2.id);
    const feeA = await recordFee(w.academy, w.admin, w.student2.id);
    const inA = expectStatus(
      await call("GET", `/api/v1/me/fees?academyId=${w.academy.id}`, {
        user: w.student2,
      }),
      200
    ).data.map((row: Body) => row.id);
    expect(inA).toContain(feeA.id);
    expect(inA).not.toContain(feeB.id);
    // A's coach still cannot see B's rows for this student.
    const cross = await call("GET", w.academy.path(`/fees/${feeB.id}`), {
      user: w.coach,
    });
    expect(cross.status).toBe(404);
  });

  it("guessing: random, near-miss and malformed codes all get the identical 404", async () => {
    const real = await createCode(w.admin, { role: "student", maxUses: null });
    const attacker = await signUp("guesser");
    const guesses = [
      ...Array.from({ length: GUESSES }, randomCode),
      nearMiss(real.code),
      `${raw(real.code).slice(0, 11)}`,
      `${raw(real.code)}2`,
      `0${raw(real.code).slice(1)}`,
      "0000-0000-0000",
      "IIII-LLLL-OOOO",
      "",
      "   ",
      "' OR 1=1 --",
    ];
    const bodies = new Set<string>();
    for (const guess of guesses) {
      for (const send of [preview, redeem]) {
        const reply = await send(attacker, guess);
        expect(reply.status, `${guess}: ${reply.text}`).toBe(404);
        bodies.add(reply.text);
      }
    }
    expect([...bodies]).toEqual([
      JSON.stringify({
        error: { code: "invalid_code", message: "This code is not valid" },
      }),
    ]);
    expect(await memberRole(attacker.id)).toBeNull();
  });

  it("input variants of a real code are accepted", async () => {
    const code = await createCode(w.admin, { role: "student", maxUses: null });
    const plain = raw(code.code);
    const variants = [
      code.code,
      plain,
      plain.toLowerCase(),
      code.code.toLowerCase(),
      ` ${plain.slice(0, 4)} ${plain.slice(4, 8)} ${plain.slice(8)} `,
      `${plain.slice(0, 6)}-${plain.slice(6)}`,
      `\t${code.code}\n`,
    ];
    for (const variant of variants) {
      const reply = await preview(w.outsider, variant);
      expect(reply.status, JSON.stringify(variant)).toBe(200);
    }
  });

  it("bad request shapes: too long, not a string, form-encoded, no session", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const long = await redeem(w.outsider, "A".repeat(65));
    expect(long.status).toBe(400);
    const number = await redeem(w.outsider, 1234);
    expect(number.status).toBe(400);
    const extra = await call("POST", "/api/v1/invitation-codes/redeem", {
      user: w.outsider,
      body: { code: code.code, role: "admin" },
    });
    expect(extra.status).toBe(400);
    const form = await call("POST", "/api/v1/invitation-codes/redeem", {
      user: w.outsider,
      rawBody: `code=${encodeURIComponent(code.code)}`,
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(form.status).toBe(400);
    expect(form.body.error.code).toBe("unsupported_content_type");
    expect((await redeem(null, code.code)).status).toBe(401);
    expect((await preview(null, code.code)).status).toBe(401);
    expect(await memberRole(w.outsider.id)).toBeNull();
    expect(await useCount(code.id)).toBe(0);
  });

  it("already_redeemed: a user who left cannot reuse the same code", async () => {
    const code = await createCode(w.admin, { role: "student", maxUses: 5 });
    const user = await signUp("leaver");
    expectStatus(await redeem(user, code.code), 201);
    const left = await authCall(
      "/organization/leave",
      { organizationId: w.academy.id },
      user
    );
    expect(left.status, left.text).toBe(200);
    const again = await redeem(user, code.code);
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe("already_redeemed");
    expect(await useCount(code.id)).toBe(1);
  });

  it("one team per student: leaving the academy drops the team row, so a new team code works", async () => {
    const user = await signUp("team-hopper");
    const toB = await createCode(w.admin, { role: "student", teamId: w.teamB });
    expectStatus(await redeem(user, toB.code), 201);
    const left = await authCall(
      "/organization/leave",
      { organizationId: w.academy.id },
      user
    );
    expect(left.status).toBe(200);
    // No stale team row: the 422 one_team_per_student path cannot be reached
    // over HTTP (a member is refused earlier with already_member).
    expect(await teamsOf(user.id)).toEqual([]);
    const toA = await createCode(w.admin, { role: "student", teamId: w.teamA });
    expectStatus(await redeem(user, toA.code), 201);
    expect(await teamsOf(user.id)).toEqual([w.teamA]);
  });

  it("a banned user cannot redeem (401) and uses nothing", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const user = await signUp("banned-joiner");
    const ban = await authCall(
      "/admin/ban-user",
      { userId: user.id, banReason: "e2e" },
      owner
    );
    expect(ban.status).toBe(200);
    const reply = await redeem(user, code.code);
    expect(reply.status).toBe(401);
    expect(await useCount(code.id)).toBe(0);
  });
});

describe("what preview reveals", () => {
  it("an active code: academy id/name/slug, role, team, expiry and alreadyMember; nothing else", async () => {
    const code = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
    });
    const { data } = expectStatus(await preview(w.outsider, code.code), 200);
    expect(Object.keys(data).sort()).toEqual([
      "academy",
      "alreadyMember",
      "expiresAt",
      "role",
      "team",
    ]);
    expect(Object.keys(data.academy).sort()).toEqual(["id", "name", "slug"]);
    expect(Object.keys(data.team).sort()).toEqual(["ageGroup", "id", "name"]);
    const text = JSON.stringify(data);
    for (const leak of [
      "maxUses",
      "useCount",
      "createdBy",
      "redemptions",
      "latitude",
      "qrNonce",
      w.admin.email,
    ]) {
      expect(text).not.toContain(leak);
    }
    expect((await preview(w.student, code.code)).body.data.alreadyMember).toBe(
      true
    );
  });

  it("revoked, used-up and expired codes reveal only the status", async () => {
    const academyNeedles = [
      w.academy.id,
      // The seeded academy's name is its slug.
      w.academy.slug,
      w.teamA,
    ];
    const revoked = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
    });
    await call("POST", codesPath(w.academy.id, `/${revoked.id}/revoke`), {
      user: w.admin,
      body: {},
    });
    const usedUp = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
    });
    expectStatus(await redeem(await signUp("uses-it"), usedUp.code), 201);
    const expired = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
      expiresAt: new Date(Date.now() + 1500).toISOString(),
    });
    await new Promise((resolve) => setTimeout(resolve, 2000));
    for (const [code, expected] of [
      [revoked, "code_revoked"],
      [usedUp, "code_used_up"],
      [expired, "code_expired"],
    ] as const) {
      const reply = await preview(w.outsider, code.code);
      expect(reply.status).toBe(410);
      expect(isErrorEnvelope(reply.body)).toBe(true);
      expect(reply.body.error.code).toBe(expected);
      expect(reply.body.error.details).toBeUndefined();
      for (const needle of academyNeedles) {
        expect(reply.text).not.toContain(needle);
      }
    }
  });
});

describe("who can see or obtain a code value", () => {
  it("no code value appears in anything a coach or student can read", async () => {
    // Make sure there is fresh activity of every kind.
    const code = await createCode(w.admin, {
      role: "student",
      teamId: w.teamA,
      maxUses: 5,
    });
    expectStatus(await redeem(await signUp("activity"), code.code), 201);
    await createRecord(w.academy, w.student, w.student.id, "academic");
    const today = todayIn(w.academy);
    const apiPaths = [
      "/teams",
      `/teams/${w.teamA}/members`,
      "/attendance",
      "/fees",
      "/fees/outstanding",
      `/events?from=${today}&to=${today}`,
      "/records",
      `/students/${w.student.id}/records`,
      "/record-templates",
      "/invitation-codes",
      "/dashboard",
      "/audit-log",
    ];
    const authPaths = [
      `/organization/get-full-organization?organizationId=${w.academy.id}`,
      `/organization/list-invitations?organizationId=${w.academy.id}`,
      `/organization/list-members?organizationId=${w.academy.id}`,
      `/organization/list-teams?organizationId=${w.academy.id}`,
      "/organization/list",
      "/organization/list-user-invitations",
      "/get-session",
    ];
    for (const user of [w.coach, w.student, w.outsider]) {
      for (const path of apiPaths) {
        const reply = await call("GET", w.academy.path(path), { user });
        expectNoCodes(reply.text, `${user.label} GET ${path}`);
      }
      for (const path of authPaths) {
        const reply = await authGet(path, user);
        expectNoCodes(reply.text, `${user.label} ${path}`);
      }
      for (const path of ["/api/v1/me/attendance", "/api/v1/me/fees"]) {
        const reply = await call("GET", `${path}?academyId=${w.academy.id}`, {
          user,
        });
        expectNoCodes(reply.text, `${user.label} ${path}`);
      }
    }
  });

  it("an academy admin never sees an admin-role code value, anywhere they can read", async () => {
    const code = await createCode(owner, { role: "admin" });
    const joiner = await signUp("admin-by-code");
    expectStatus(await redeem(joiner, code.code), 201);
    const reads = [
      w.academy.path("/invitation-codes?limit=200"),
      w.academy.path("/audit-log?limit=200"),
      w.academy.path("/dashboard"),
      w.academy.path("/teams"),
    ];
    for (const path of reads) {
      const reply = await call("GET", path, { user: w.admin });
      expectNoCodes(reply.text, `admin GET ${path}`, adminIssued);
    }
    for (const path of [
      `/organization/get-full-organization?organizationId=${w.academy.id}`,
      `/organization/list-invitations?organizationId=${w.academy.id}`,
    ]) {
      const reply = await authGet(path, w.admin);
      expectNoCodes(reply.text, `admin ${path}`, adminIssued);
    }
  });

  // FIXED D8 (was a known defect): the owner's admin-code create row is written with the
  // academy's id, so the academy admin's GET /audit-log shows that an admin
  // code exists, its id, expiry and an unsalted 48-bit SHA-256 fingerprint
  // of the value. The value itself is not exposed (brute force over 30^12
  // codes is impractical), but "admin codes are invisible to academy admins"
  // does not hold.
  it("FIXED D8: the academy admin's audit log shows nothing about admin codes", async () => {
    const code = await createCode(owner, { role: "admin" });
    const reply = await call("GET", w.academy.path("/audit-log?limit=200"), {
      user: w.admin,
    });
    expect(reply.status).toBe(200);
    expect(reply.text).not.toContain(code.id);
    const rows = reply.body.data.filter(
      (row: Body) => row.after?.role === "admin" || row.before?.role === "admin"
    );
    expect(rows).toEqual([]);
  });

  it("the audit logs (academy and owner) hold fingerprints, never code values", async () => {
    const academyLog = await call(
      "GET",
      w.academy.path("/audit-log?limit=200"),
      {
        user: w.admin,
      }
    );
    expectNoCodes(academyLog.text, "academy audit log");
    expect(academyLog.text).toContain("codeFingerprint");
    for (const path of [
      "/api/v1/admin/audit-log?limit=200",
      `/api/v1/admin/academies/${w.academy.id}/audit-log?limit=200`,
      `/api/v1/admin/academies/${w.academy.id}/members`,
      `/api/v1/admin/academies/${w.academy.id}/invitations`,
    ]) {
      const reply = await call("GET", path, { user: owner });
      expect(reply.status, path).toBe(200);
      expectNoCodes(reply.text, path);
    }
  });

  it("error bodies never echo a code", async () => {
    const code = await createCode(w.admin, { role: "student" });
    const replies = [
      await redeem(w.student, code.code),
      await call("POST", codesPath(w.academy.id), {
        user: w.coach,
        body: { role: "student" },
      }),
      await call("GET", codesPath(w.academy.id, `/${code.id}`), {
        user: w.student,
      }),
    ];
    for (const reply of replies) {
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expectNoCodes(reply.text, `error ${reply.status}`);
    }
  });
});

describe("invitation privacy (Better Auth)", () => {
  let memberInvitationId: string;
  let adminInvitationId: string;

  beforeAll(async () => {
    const sent = await authCall(
      "/organization/invite-member",
      {
        email: `e2e-priv-${crypto.randomUUID().slice(0, 8)}@test.hoops-genesis.local`,
        role: "coach",
        organizationId: w.academy.id,
      },
      w.admin
    );
    memberInvitationId = expectStatus(sent, 200).id;
    const appoint = await call(
      "POST",
      `/api/v1/admin/academies/${w.academy.id}/admins`,
      {
        user: owner,
        body: {
          email: `e2e-priv-admin-${crypto.randomUUID().slice(0, 8)}@test.hoops-genesis.local`,
        },
      }
    );
    adminInvitationId = expectStatus(appoint, 201).data.invitation.id;
  });

  it("list-invitations: 403 for coaches and students", async () => {
    for (const user of [w.coach, w.student]) {
      const reply = await authGet(
        `/organization/list-invitations?organizationId=${w.academy.id}`,
        user
      );
      expect(reply.status, `${user.label}: ${reply.text}`).toBe(403);
    }
  });

  it("list-invitations: academy admins see member invitations but not admin ones", async () => {
    const reply = await authGet(
      `/organization/list-invitations?organizationId=${w.academy.id}`,
      w.admin
    );
    const ids = expectStatus(reply, 200).map((row: Body) => row.id);
    expect(ids).toContain(memberInvitationId);
    expect(ids).not.toContain(adminInvitationId);
    expect(reply.text).not.toContain(adminInvitationId);
  });

  it("get-full-organization: invitations [] for coaches and students", async () => {
    for (const user of [w.coach, w.student]) {
      const reply = await authGet(
        `/organization/get-full-organization?organizationId=${w.academy.id}`,
        user
      );
      const body = expectStatus(reply, 200);
      expect(body.invitations, user.label).toEqual([]);
      expect(reply.text).not.toContain(memberInvitationId);
      expect(reply.text).not.toContain(adminInvitationId);
    }
    const asAdmin = await authGet(
      `/organization/get-full-organization?organizationId=${w.academy.id}`,
      w.admin
    );
    expect(asAdmin.text).not.toContain(adminInvitationId);
  });

  it("the academy audit log contains no invitation ids", async () => {
    const reply = await call("GET", w.academy.path("/audit-log?limit=200"), {
      user: w.admin,
    });
    expect(reply.status).toBe(200);
    expect(reply.text).not.toContain(memberInvitationId);
    expect(reply.text).not.toContain(adminInvitationId);
  });
});
