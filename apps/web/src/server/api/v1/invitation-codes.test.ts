import { teamMembershipKey } from "@hoops-genesis/auth/membership-rules";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { auth, db } from "../../../services";
import { secretFingerprint } from "../audit";
import {
  addMember,
  apiRequest,
  cleanup,
  createTeam,
  createTestAcademy,
  createTestUser,
  runId,
  type TestAcademy,
  type TestUser,
} from "../testing/fixtures";
import {
  CODE_ALPHABET,
  CODE_LENGTH,
  formatInvitationCode,
  generateInvitationCode,
  normalizeInvitationCode,
} from "./invitation-code-format";
import {
  adminCreateInvitationCode,
  adminGetInvitationCode,
  adminListInvitationCodes,
  adminRevokeInvitationCode,
  codeStatus,
  createInvitationCode,
  getInvitationCode,
  listInvitationCodes,
  previewInvitationCode,
  redeemInvitationCode,
  revokeInvitationCode,
} from "./invitation-codes";

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_UNAUTHORIZED = 401;
const HTTP_FORBIDDEN = 403;
const HTTP_NOT_FOUND = 404;
const HTTP_CONFLICT = 409;
const HTTP_GONE = 410;
const HTTP_UNPROCESSABLE = 422;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const GROUPED_CODE =
  /^[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}-[2-9A-HJKMNP-TV-Z]{4}$/;
const FINGERPRINT = /^[0-9a-f]{12}$/;
const LOOK_ALIKES = /[01ILOU]/;
const TRAILING_SLASHES = /\/+$/;
const CONCURRENT_USERS = 8;
const CONCURRENT_MAX_USES = 3;

let academy: TestAcademy;
let otherAcademy: TestAcademy;
let admin: TestUser;
let coach: TestUser;
let student: TestUser;
let outsider: TestUser;
let owner: TestUser;
let teamA: string;
let teamB: string;
let otherAcademyTeam: string;
const users: TestUser[] = [];
/** Every code value handed out in this file, to look for in audit rows. */
const issuedCodes: string[] = [];

interface CodeBody {
  code: string | null;
  deepLink: string;
  expiresAt: string | null;
  id: string;
  link: string;
  maxUses: number | null;
  redemptions: { user: { id: string; name: string }; userId: string }[];
  role: string;
  status: string;
  team: { ageGroup: string | null; id: string; name: string } | null;
  useCount: number;
}

interface ErrorBody {
  error: { code: string; message: string };
}

const BASE = () => `/api/v1/academies/${academy.id}/invitation-codes`;
const OWNER_BASE = () =>
  `/api/v1/admin/academies/${academy.id}/invitation-codes`;

const newUser = async (label: string): Promise<TestUser> => {
  const user = await createTestUser(label);
  users.push(user);
  return user;
};

const body = async <T>(response: Response): Promise<T> =>
  (await response.clone().json()) as T;

const create = async (
  user: TestUser,
  input: Record<string, unknown>,
  { asOwner = false } = {}
): Promise<Response> => {
  const handler = asOwner ? adminCreateInvitationCode : createInvitationCode;
  const response = await handler({
    request: apiRequest(asOwner ? OWNER_BASE() : BASE(), {
      user,
      method: "POST",
      body: input,
    }),
    params: { academyId: academy.id },
  });
  if (response.status === HTTP_CREATED) {
    const { data } = await body<{ data: CodeBody }>(response);
    issuedCodes.push(data.code ?? "");
  }
  return response;
};

const createOk = async (
  input: Record<string, unknown>,
  options: { asOwner?: boolean } = {}
): Promise<CodeBody> => {
  const response = await create(
    options.asOwner ? owner : admin,
    input,
    options
  );
  expect(response.status).toBe(HTTP_CREATED);
  return (await body<{ data: CodeBody }>(response)).data;
};

const list = (user: TestUser, { asOwner = false } = {}) =>
  (asOwner ? adminListInvitationCodes : listInvitationCodes)({
    request: apiRequest(asOwner ? OWNER_BASE() : BASE(), { user }),
    params: { academyId: academy.id },
  });

const getOne = (user: TestUser, id: string, { asOwner = false } = {}) =>
  (asOwner ? adminGetInvitationCode : getInvitationCode)({
    request: apiRequest(`${asOwner ? OWNER_BASE() : BASE()}/${id}`, { user }),
    params: { academyId: academy.id, id },
  });

const revoke = (
  user: TestUser,
  id: string,
  input?: Record<string, unknown>,
  { asOwner = false } = {}
) =>
  (asOwner ? adminRevokeInvitationCode : revokeInvitationCode)({
    request: apiRequest(`${asOwner ? OWNER_BASE() : BASE()}/${id}/revoke`, {
      user,
      method: "POST",
      body: input,
    }),
    params: { academyId: academy.id, id },
  });

const preview = (user: TestUser | undefined, code: string) =>
  previewInvitationCode({
    request: apiRequest("/api/v1/invitation-codes/preview", {
      user,
      method: "POST",
      body: { code },
    }),
    params: {},
  });

const redeem = (user: TestUser | undefined, code: string) =>
  redeemInvitationCode({
    request: apiRequest("/api/v1/invitation-codes/redeem", {
      user,
      method: "POST",
      body: { code },
    }),
    params: {},
  });

const errorCode = async (response: Response): Promise<string> =>
  (await body<ErrorBody>(response)).error.code;

/** 410 with `code`, and nothing about the academy in the body. */
const expectGone = async (
  responses: readonly Response[],
  code: string
): Promise<void> => {
  const texts = await Promise.all(
    responses.map((response) => response.clone().text())
  );
  expect(responses.map((response) => response.status)).toEqual(
    responses.map(() => HTTP_GONE)
  );
  for (const text of texts) {
    expect((JSON.parse(text) as ErrorBody).error.code).toBe(code);
    expect(text).not.toContain(academy.slug);
  }
};

const memberRole = async (userId: string): Promise<string | null> =>
  (
    await db.member.findUnique({
      where: { organizationId_userId: { organizationId: academy.id, userId } },
      select: { role: true },
    })
  )?.role ?? null;

const useCountOf = async (id: string): Promise<number> =>
  (await db.invitationCode.findUniqueOrThrow({ where: { id } })).useCount;

beforeAll(async () => {
  academy = await createTestAcademy();
  otherAcademy = await createTestAcademy();
  [admin, coach, student, outsider] = await Promise.all(
    ["ic-admin", "ic-coach", "ic-student", "ic-outsider"].map((label) =>
      newUser(label)
    )
  );
  owner = await createTestUser("ic-owner", { platformRole: "admin" });
  users.push(owner);
  await Promise.all([
    addMember(academy, admin, "admin"),
    addMember(academy, coach, "coach"),
    addMember(academy, student, "student"),
  ]);
  teamA = await createTeam(academy, [coach, student]);
  teamB = await createTeam(academy, []);
  otherAcademyTeam = await createTeam(otherAcademy, []);
  await db.team.update({ where: { id: teamA }, data: { ageGroup: "U14" } });
});

afterAll(async () => {
  const academyIds = [academy.id, otherAcademy.id];
  await db.invitationCode.deleteMany({
    where: { academyId: { in: academyIds } },
  });
  await db.teamMember.deleteMany({
    where: { team: { organizationId: { in: academyIds } } },
  });
  await cleanup([academy, otherAcademy], users);
});

describe("the code format", () => {
  it("12 characters from a 30-letter alphabet without look-alikes", () => {
    expect(CODE_ALPHABET).toHaveLength(30);
    expect(CODE_ALPHABET).not.toMatch(LOOK_ALIKES);
    const codes = new Set(
      Array.from({ length: 200 }, () => generateInvitationCode())
    );
    expect(codes.size).toBe(200);
    for (const code of codes) {
      expect(code).toHaveLength(CODE_LENGTH);
      expect(formatInvitationCode(code)).toMatch(GROUPED_CODE);
    }
  });

  it("accepts any case, with or without dashes and spaces", () => {
    const code = generateInvitationCode();
    const grouped = formatInvitationCode(code);
    for (const input of [
      code,
      grouped,
      grouped.toLowerCase(),
      ` ${grouped.replaceAll("-", " ")} `,
    ]) {
      expect(normalizeInvitationCode(input)).toBe(code);
    }
    expect(normalizeInvitationCode("ABCD-EFGH-IJK0")).toBeNull();
    expect(normalizeInvitationCode("short")).toBeNull();
  });

  it("status: revoked, then used up, then expired; expired at exactly expiresAt", () => {
    const now = new Date();
    const base = { revokedAt: null, maxUses: 2, useCount: 0, expiresAt: now };
    expect(codeStatus(base, now)).toBe("expired");
    expect(
      codeStatus({ ...base, expiresAt: new Date(now.getTime() + 1) }, now)
    ).toBe("active");
    expect(codeStatus({ ...base, useCount: 2 }, now)).toBe("used_up");
    expect(codeStatus({ ...base, useCount: 2, revokedAt: now }, now)).toBe(
      "revoked"
    );
  });
});

describe("managing codes", () => {
  it("an academy admin creates a code: single use and 7 days by default, with links; audited by fingerprint", async () => {
    const before = Date.now();
    const data = await createOk({ role: "student", teamId: teamA });
    expect(data.code).toMatch(GROUPED_CODE);
    expect(data.link).toBe(
      `${process.env.BETTER_AUTH_URL?.replace(TRAILING_SLASHES, "")}/join/${data.code}`
    );
    expect(data.deepLink).toBe(`hoops-genesis://join?code=${data.code}`);
    expect(data).toMatchObject({
      role: "student",
      maxUses: 1,
      useCount: 0,
      status: "active",
      team: { id: teamA, ageGroup: "U14" },
      redemptions: [],
    });
    const expiresIn = Date.parse(data.expiresAt ?? "") - before;
    expect(expiresIn).toBeGreaterThanOrEqual(7 * DAY_MS - 1000);
    expect(expiresIn).toBeLessThanOrEqual(7 * DAY_MS + 5000);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "invitation_code.create", entityId: data.id },
    });
    expect(audit.after).toMatchObject({
      codeFingerprint: secretFingerprint(
        normalizeInvitationCode(data.code ?? "") ?? ""
      ),
    });
  });

  it("validates limits, the team and the role", async () => {
    const cases: [Record<string, unknown>, number, string][] = [
      [{ role: "admin" }, HTTP_FORBIDDEN, "admin_codes_owner_only"],
      [{ role: "owner" }, HTTP_BAD_REQUEST, "validation_failed"],
      [{ role: "coach", maxUses: 0 }, HTTP_BAD_REQUEST, "validation_failed"],
      [
        {
          role: "coach",
          expiresAt: new Date(Date.now() + 91 * DAY_MS).toISOString(),
        },
        HTTP_BAD_REQUEST,
        "lifetime_too_long",
      ],
      [
        { role: "coach", expiresAt: new Date(Date.now() - 1000).toISOString() },
        HTTP_BAD_REQUEST,
        "expires_at_in_past",
      ],
      [
        { role: "student", teamId: otherAcademyTeam },
        HTTP_NOT_FOUND,
        "team_not_found",
      ],
    ];
    const responses = await Promise.all(
      cases.map(([input]) => create(admin, input))
    );
    const results = await Promise.all(
      responses.map(async (response) => [
        response.status,
        await errorCode(response),
      ])
    );
    expect(results).toEqual(cases.map(([, status, code]) => [status, code]));
  });

  it("coaches, students and outsiders cannot create, list, read or revoke codes, anywhere", async () => {
    const code = await createOk({ role: "coach", maxUses: null });
    const value = code.code ?? "";
    const calls = [coach, student, outsider].flatMap((user) => [
      create(user, { role: "student" }),
      list(user),
      getOne(user, code.id),
      revoke(user, code.id),
      create(user, { role: "student" }, { asOwner: true }),
      list(user, { asOwner: true }),
      getOne(user, code.id, { asOwner: true }),
      revoke(user, code.id, undefined, { asOwner: true }),
    ]);
    const responses = await Promise.all(calls);
    const texts = await Promise.all(responses.map((r) => r.clone().text()));
    const statuses = responses.map((response) => response.status);
    // Members get 403; the outsider gets 404 on academy routes, 403 on owner routes.
    expect(statuses.slice(0, 16).every((s) => s === HTTP_FORBIDDEN)).toBe(true);
    expect(statuses.slice(16, 20)).toEqual(new Array(4).fill(HTTP_NOT_FOUND));
    expect(statuses.slice(20)).toEqual(new Array(4).fill(HTTP_FORBIDDEN));
    for (const text of texts) {
      expect(text).not.toContain(value);
      expect(text).not.toContain(normalizeInvitationCode(value));
    }
    expect((await getOne(admin, code.id)).status).toBe(HTTP_OK);
  });

  it("revoking is final, audited with a reason and a fingerprint", async () => {
    const code = await createOk({ role: "coach", maxUses: 5 });
    const response = await revoke(admin, code.id, {
      reason: "Posted in a group",
    });
    expect(response.status).toBe(HTTP_OK);
    const { data } = await body<{ data: CodeBody & { revokeReason: string } }>(
      response
    );
    expect(data).toMatchObject({
      status: "revoked",
      revokeReason: "Posted in a group",
    });
    expect((await revoke(admin, code.id)).status).toBe(HTTP_CONFLICT);
    const audit = await db.auditLog.findFirstOrThrow({
      where: { action: "invitation_code.revoke", entityId: code.id },
    });
    expect(audit).toMatchObject({
      actorId: admin.id,
      reason: "Posted in a group",
    });
    const joiner = await newUser("ic-late");
    await expectGone(
      [
        await preview(joiner, code.code ?? ""),
        await redeem(joiner, code.code ?? ""),
      ],
      "code_revoked"
    );
    // A revoke without a body works too.
    const other = await createOk({ role: "coach" });
    expect((await revoke(admin, other.id)).status).toBe(HTTP_OK);
  });

  it("lists newest first with creator, use count and who redeemed", async () => {
    const code = await createOk({ role: "coach", maxUses: 2 });
    const joiner = await newUser("ic-listed");
    expect((await redeem(joiner, code.code ?? "")).status).toBe(HTTP_CREATED);
    const response = await list(admin);
    expect(response.status).toBe(HTTP_OK);
    const { data } = await body<{
      data: (CodeBody & { createdBy: unknown })[];
    }>(response);
    expect(data[0]).toMatchObject({
      id: code.id,
      useCount: 1,
      maxUses: 2,
      status: "active",
      createdBy: { id: admin.id, name: "ic-admin" },
      redemptions: [{ userId: joiner.id, user: { id: joiner.id } }],
    });
  });
});

describe("admin-role codes", () => {
  it("only the owner creates them: single use, at most 72 hours, no team", async () => {
    const data = await createOk({ role: "admin" }, { asOwner: true });
    expect(data).toMatchObject({ role: "admin", maxUses: 1, team: null });
    const lifetime = Date.parse(data.expiresAt ?? "") - Date.now();
    expect(lifetime).toBeLessThanOrEqual(48 * HOUR_MS);
    const bad = await Promise.all([
      create(owner, { role: "admin", maxUses: 2 }, { asOwner: true }),
      create(owner, { role: "admin", maxUses: null }, { asOwner: true }),
      create(
        owner,
        {
          role: "admin",
          expiresAt: new Date(Date.now() + 73 * HOUR_MS).toISOString(),
        },
        { asOwner: true }
      ),
      create(owner, { role: "admin", teamId: teamA }, { asOwner: true }),
    ]);
    expect(bad.map((response) => response.status)).toEqual(
      new Array(4).fill(HTTP_BAD_REQUEST)
    );
    // The owner also creates ordinary codes.
    await createOk({ role: "student", teamId: teamB }, { asOwner: true });
  });

  it("an academy admin never receives an admin code's value", async () => {
    const data = await createOk({ role: "admin" }, { asOwner: true });
    const value = data.code ?? "";
    const responses = await Promise.all([
      list(admin),
      getOne(admin, data.id),
      revoke(admin, data.id),
    ]);
    expect(responses.map((response) => response.status)).toEqual([
      HTTP_OK,
      HTTP_NOT_FOUND,
      HTTP_NOT_FOUND,
    ]);
    const texts = await Promise.all(responses.map((r) => r.clone().text()));
    for (const text of texts) {
      expect(text).not.toContain(data.id);
      expect(text).not.toContain(value);
    }
    const ownerList = await list(owner, { asOwner: true });
    expect(await ownerList.clone().text()).toContain(value);
    expect((await getOne(owner, data.id, { asOwner: true })).status).toBe(
      HTTP_OK
    );
  });

  it("redeeming makes the person an admin", async () => {
    const data = await createOk({ role: "admin" }, { asOwner: true });
    const newAdmin = await newUser("ic-new-admin");
    expect((await redeem(newAdmin, data.code ?? "")).status).toBe(HTTP_CREATED);
    expect(await memberRole(newAdmin.id)).toBe("admin");
    const owners = await revoke(owner, data.id, undefined, { asOwner: true });
    expect(owners.status).toBe(HTTP_OK);
  });
});

describe("preview", () => {
  it("shows the academy, role, team and expiry, for any typing of the code", async () => {
    const data = await createOk({ role: "student", teamId: teamA });
    const value = data.code ?? "";
    const joiner = await newUser("ic-previewer");
    const responses = await Promise.all(
      [
        value,
        value.toLowerCase(),
        value.replaceAll("-", ""),
        value.replaceAll("-", " "),
      ].map((input) => preview(joiner, input))
    );
    for (const response of responses) {
      expect(response.status).toBe(HTTP_OK);
    }
    const { data: shown } = await body<{ data: Record<string, unknown> }>(
      responses[0] as Response
    );
    expect(shown).toEqual({
      academy: { id: academy.id, name: academy.slug, slug: academy.slug },
      role: "student",
      team: { id: teamA, name: expect.any(String), ageGroup: "U14" },
      expiresAt: data.expiresAt,
      alreadyMember: false,
    });
    expect(await useCountOf(data.id)).toBe(0);
    const memberView = await preview(student, value);
    expect(
      (await body<{ data: { alreadyMember: boolean } }>(memberView)).data
    ).toMatchObject({ alreadyMember: true });
  });

  it("one 404 invalid_code for unknown and malformed codes; sign-in required", async () => {
    const joiner = await newUser("ic-prober");
    const responses = await Promise.all([
      preview(joiner, generateInvitationCode()),
      preview(joiner, "not a code"),
      redeem(joiner, generateInvitationCode()),
    ]);
    const bodies = await Promise.all(
      responses.map((response) => response.clone().json())
    );
    expect(responses.map((response) => response.status)).toEqual(
      new Array(3).fill(HTTP_NOT_FOUND)
    );
    expect(new Set(bodies.map((b) => JSON.stringify(b))).size).toBe(1);
    expect((bodies[0] as ErrorBody).error.code).toBe("invalid_code");
    expect((await preview(undefined, "x")).status).toBe(HTTP_UNAUTHORIZED);
    expect((await redeem(undefined, "x")).status).toBe(HTTP_UNAUTHORIZED);
  });

  it("expired codes answer 410 code_expired, at the boundary too", async () => {
    const data = await createOk({ role: "coach", maxUses: null });
    const joiner = await newUser("ic-expired");
    await db.invitationCode.update({
      where: { id: data.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });
    await expectGone(
      [
        await preview(joiner, data.code ?? ""),
        await redeem(joiner, data.code ?? ""),
      ],
      "code_expired"
    );
    await db.invitationCode.update({
      where: { id: data.id },
      data: { expiresAt: new Date(Date.now() + 5000) },
    });
    expect((await redeem(joiner, data.code ?? "")).status).toBe(HTTP_CREATED);
  });
});

describe("redeem", () => {
  it("a single-use code makes a member with its role and team, as Better Auth would; then it is used up", async () => {
    const data = await createOk({ role: "student", teamId: teamA });
    const value = data.code ?? "";
    const joiner = await newUser("ic-joiner");
    const countBefore = (
      await db.team.findUniqueOrThrow({ where: { id: teamA } })
    ).memberCount;
    const response = await redeem(joiner, value.toLowerCase());
    expect(response.status).toBe(HTTP_CREATED);
    expect((await body<{ data: unknown }>(response)).data).toMatchObject({
      academy: { id: academy.id },
      member: { userId: joiner.id, roles: ["student"] },
      team: { id: teamA },
    });
    expect(await memberRole(joiner.id)).toBe("student");
    const teamRow = await db.teamMember.findFirstOrThrow({
      where: { teamId: teamA, userId: joiner.id },
    });
    expect(teamRow.membershipKey).toBe(teamMembershipKey(teamA, joiner.id));
    expect(
      (await db.team.findUniqueOrThrow({ where: { id: teamA } })).memberCount
    ).toBe(countBefore + 1);
    expect(await useCountOf(data.id)).toBe(1);

    // Better Auth sees an ordinary member.
    const full = await auth.api.getFullOrganization({
      query: { organizationId: academy.id },
      headers: new Headers({ cookie: joiner.cookie }),
    });
    expect(full?.members.map((member) => member.userId)).toContain(joiner.id);

    const late = await newUser("ic-too-late");
    const usedUp = await redeem(late, value);
    expect(usedUp.status).toBe(HTTP_GONE);
    expect(await errorCode(usedUp)).toBe("code_used_up");
    expect(await memberRole(late.id)).toBeNull();

    const audit = await db.auditLog.findMany({
      where: { academyId: academy.id, actorId: joiner.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "member.join_by_code",
      "team.member_add",
    ]);
    expect(audit[0]?.after).toMatchObject({
      codeId: data.id,
      codeFingerprint: expect.stringMatching(FINGERPRINT),
    });
  });

  it("a many-use code admits several people, each once", async () => {
    const data = await createOk({ role: "coach", maxUses: null });
    const joiners = await Promise.all(
      ["ic-many-1", "ic-many-2", "ic-many-3"].map((label) => newUser(label))
    );
    const responses = await Promise.all(
      joiners.map((joiner) => redeem(joiner, data.code ?? ""))
    );
    expect(responses.map((response) => response.status)).toEqual(
      new Array(3).fill(HTTP_CREATED)
    );
    expect(await useCountOf(data.id)).toBe(3);
  });

  it("an existing member gets 409 already_member; no use is taken and nothing changes", async () => {
    const data = await createOk({ role: "coach", teamId: teamB });
    const response = await redeem(student, data.code ?? "");
    expect(response.status).toBe(HTTP_CONFLICT);
    expect(await errorCode(response)).toBe("already_member");
    expect(await useCountOf(data.id)).toBe(0);
    expect(await memberRole(student.id)).toBe("student");
    expect(
      await db.teamMember.count({
        where: { teamId: teamB, userId: student.id },
      })
    ).toBe(0);
  });

  it("the same person redeeming the same code twice takes one use at most", async () => {
    const data = await createOk({ role: "coach", maxUses: 5 });
    const joiner = await newUser("ic-twice");
    const [first, second] = await Promise.all([
      redeem(joiner, data.code ?? ""),
      redeem(joiner, data.code ?? ""),
    ]);
    expect([first?.status, second?.status].sort()).toEqual([
      HTTP_CREATED,
      HTTP_CONFLICT,
    ]);
    expect(await useCountOf(data.id)).toBe(1);
    // Removed from the academy, they still cannot reuse the code.
    await db.member.deleteMany({
      where: { organizationId: academy.id, userId: joiner.id },
    });
    const again = await redeem(joiner, data.code ?? "");
    expect(again.status).toBe(HTTP_CONFLICT);
    expect(await errorCode(again)).toBe("already_redeemed");
    expect(await useCountOf(data.id)).toBe(1);
  });

  it("a platform admin is refused", async () => {
    const data = await createOk({ role: "coach" });
    const response = await redeem(owner, data.code ?? "");
    expect(response.status).toBe(HTTP_FORBIDDEN);
    expect(await errorCode(response)).toBe("platform_admin_cannot_be_member");
    expect(await useCountOf(data.id)).toBe(0);
  });

  it("keeps the one-team-per-student rule", async () => {
    const data = await createOk({ role: "student", teamId: teamA });
    const joiner = await newUser("ic-two-teams");
    // Left on another team of the academy (e.g. by an old roster row).
    await db.teamMember.create({
      data: {
        id: `tm-${runId()}`,
        teamId: teamB,
        userId: joiner.id,
        createdAt: new Date(),
      },
    });
    const response = await redeem(joiner, data.code ?? "");
    expect(response.status).toBe(HTTP_UNPROCESSABLE);
    expect(await errorCode(response)).toBe("one_team_per_student");
    expect(await useCountOf(data.id)).toBe(0);
    expect(await memberRole(joiner.id)).toBeNull();
  });

  it(`concurrent redemptions: ${CONCURRENT_USERS} people, max ${CONCURRENT_MAX_USES} uses, exactly ${CONCURRENT_MAX_USES} join`, async () => {
    const data = await createOk({
      role: "student",
      maxUses: CONCURRENT_MAX_USES,
    });
    const joiners = await Promise.all(
      Array.from({ length: CONCURRENT_USERS }, (_, index) =>
        newUser(`ic-race-${index}`)
      )
    );
    const responses = await Promise.all(
      joiners.map((joiner) => redeem(joiner, data.code ?? ""))
    );
    const statuses = responses.map((response) => response.status);
    expect(statuses.filter((s) => s === HTTP_CREATED)).toHaveLength(
      CONCURRENT_MAX_USES
    );
    expect(statuses.filter((s) => s === HTTP_GONE)).toHaveLength(
      CONCURRENT_USERS - CONCURRENT_MAX_USES
    );
    expect(await useCountOf(data.id)).toBe(CONCURRENT_MAX_USES);
    expect(
      await db.invitationCodeRedemption.count({ where: { codeId: data.id } })
    ).toBe(CONCURRENT_MAX_USES);
    expect(
      await db.member.count({
        where: {
          organizationId: academy.id,
          userId: { in: joiners.map((joiner) => joiner.id) },
        },
      })
    ).toBe(CONCURRENT_MAX_USES);
  });
});

describe("codes stay out of audit rows and logs", () => {
  it("no issued code appears in any audit row of the academy", async () => {
    const rows = await db.auditLog.findMany({
      where: { academyId: academy.id },
    });
    expect(rows.length).toBeGreaterThan(0);
    const text = JSON.stringify(rows);
    for (const code of issuedCodes) {
      expect(text).not.toContain(code);
      expect(text).not.toContain(normalizeInvitationCode(code) ?? code);
    }
  });

  it("nothing is logged while creating, previewing, redeeming and revoking", async () => {
    const spies = (["log", "info", "warn", "error", "debug"] as const).map(
      (method) => vi.spyOn(console, method)
    );
    try {
      const data = await createOk({ role: "coach", maxUses: 2 });
      const joiner = await newUser("ic-quiet");
      await preview(joiner, data.code ?? "");
      await redeem(joiner, data.code ?? "");
      await redeem(joiner, data.code ?? "");
      await revoke(admin, data.id);
      const logged = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
      expect(logged).not.toContain(data.code ?? "");
      expect(logged).not.toContain(
        normalizeInvitationCode(data.code ?? "") ?? ""
      );
    } finally {
      for (const spy of spies) {
        spy.mockRestore();
      }
    }
  });
});
