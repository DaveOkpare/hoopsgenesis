/**
 * Integration-test fixtures: real users (signed up through Better Auth, so
 * their session cookies are real), an academy, members and teams, written to
 * the database in apps/web/.env. Each test file makes its own academy with a
 * unique slug, so files and runs never see each other's rows. ./setup.ts
 * refuses to run against a non-local database.
 *
 * Cleanup: `cleanup()` deletes what it can. audit_log rows can never be
 * deleted, and they block deleting their academy, actor and impersonator
 * (impersonated_by), so an academy
 * (and any user) that has audit rows stays behind; that is expected.
 */
import { randomUUID } from "node:crypto";

import { auth, db } from "../../../services";

const TEST_PASSWORD = "test-password-1234";
const BASE_URL = "http://localhost:3001";

export interface TestUser {
  /** Send as the `cookie` header to be signed in as this user. */
  cookie: string;
  email: string;
  id: string;
}

export interface TestAcademy {
  id: string;
  slug: string;
}

/** A unique suffix for this test run. */
export const runId = (): string => randomUUID().slice(0, 8);

const toCookieHeader = (headers: Headers): string =>
  headers
    .getSetCookie()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");

export const createTestUser = async (
  label: string,
  options: { platformRole?: string } = {}
): Promise<TestUser> => {
  const email = `${label}-${runId()}@test.hoops-genesis.local`;
  const { headers, response } = await auth.api.signUpEmail({
    body: { email, password: TEST_PASSWORD, name: label },
    returnHeaders: true,
  });
  if (options.platformRole) {
    await db.user.update({
      where: { id: response.user.id },
      data: { role: options.platformRole },
    });
  }
  return { id: response.user.id, email, cookie: toCookieHeader(headers) };
};

export const createTestAcademy = async (
  timezone = "Africa/Lagos"
): Promise<TestAcademy> => {
  const slug = `test-academy-${runId()}`;
  const academy = await db.organization.create({
    data: {
      id: randomUUID(),
      name: slug,
      slug,
      createdAt: new Date(),
      timezone,
      defaultCurrency: "NGN",
      latitude: 6.5244,
      longitude: 3.3792,
      attendanceRadiusM: 150,
      qrNonce: randomUUID(),
    },
    select: { id: true, slug: true },
  });
  return academy;
};

/** `role` may be comma-separated, e.g. "coach,student". */
export const addMember = async (
  academy: TestAcademy,
  user: TestUser,
  role: string
): Promise<void> => {
  await db.member.create({
    data: {
      id: randomUUID(),
      organizationId: academy.id,
      userId: user.id,
      role,
      createdAt: new Date(),
    },
  });
};

export const createTeam = async (
  academy: TestAcademy,
  members: readonly TestUser[]
): Promise<string> => {
  const team = await db.team.create({
    data: {
      id: randomUUID(),
      name: `team-${runId()}`,
      organizationId: academy.id,
      createdAt: new Date(),
    },
    select: { id: true },
  });
  await db.teamMember.createMany({
    data: members.map((member) => ({
      id: randomUUID(),
      teamId: team.id,
      userId: member.id,
      createdAt: new Date(),
    })),
  });
  return team.id;
};

/** A Request as the router would pass it to a handler. */
export const apiRequest = (
  path: string,
  options: {
    user?: TestUser;
    method?: string;
    body?: unknown;
    headers?: Record<string, string>;
  } = {}
): Request => {
  const headers = new Headers(options.headers);
  if (options.user) {
    headers.set("cookie", options.user.cookie);
  }
  if (options.body !== undefined) {
    headers.set("content-type", "application/json");
  }
  return new Request(`${BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
};

/** Deletes the users and academy, skipping any held in place by audit rows. */
export const cleanup = async (
  academies: readonly TestAcademy[],
  users: readonly TestUser[]
): Promise<void> => {
  const academyIds = academies.map((academy) => academy.id);
  const userIds = users.map((user) => user.id);
  await db.idempotencyKey.deleteMany({
    where: { OR: userIds.map((id) => ({ scope: { startsWith: `${id} ` } })) },
  });
  await db.member.deleteMany({ where: { organizationId: { in: academyIds } } });
  await db.team.deleteMany({ where: { organizationId: { in: academyIds } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  const audited = await db.auditLog.findMany({
    where: {
      OR: [
        { actorId: { in: userIds } },
        { impersonatedById: { in: userIds } },
        { academyId: { in: academyIds } },
      ],
    },
    select: { actorId: true, impersonatedById: true, academyId: true },
    distinct: ["actorId", "impersonatedById", "academyId"],
  });
  const keptUsers = new Set(
    audited.flatMap((row) => [row.actorId, row.impersonatedById])
  );
  const keptAcademies = new Set(audited.map((row) => row.academyId));
  await db.user.deleteMany({
    where: { id: { in: userIds.filter((id) => !keptUsers.has(id)) } },
  });
  await db.organization.deleteMany({
    where: { id: { in: academyIds.filter((id) => !keptAcademies.has(id)) } },
  });
};
