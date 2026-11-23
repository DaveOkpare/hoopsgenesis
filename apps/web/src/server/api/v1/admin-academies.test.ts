import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { auth, db } from "../../../services";
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
  appointAcademyAdmin,
  cancelAdminInvitation,
  createAcademy,
  deleteAcademy,
  listAcademies,
  removeAcademyAdmin,
} from "./admin-academies";
import { type ErrorBody, readJson } from "./attendance-fixtures";
import { listAdminAuditLog } from "./audit-log";

const BASE = "/api/v1/admin/academies";

let platformOwner: TestUser;
let academyAdmin: TestUser;
let firstAdmin: TestUser;
let coach: TestUser;
let otherPlatformAdmin: TestUser;
const academies: TestAcademy[] = [];
const users: TestUser[] = [];

interface AcademyBody {
  data: {
    firstAdmin:
      | { status: "member"; member: { role: string; userId: string } }
      | { status: "invited"; invitation: { email: string; id: string } };
    id: string;
    slug: string;
  };
}

const academyBody = (person: Record<string, string>) => {
  const slug = `owner-made-${runId()}`;
  return {
    name: `Owner made ${slug}`,
    slug,
    timezone: "Africa/Lagos",
    defaultCurrency: "NGN",
    latitude: 6.45,
    longitude: 3.39,
    location: "Lagos",
    firstAdmin: person,
  };
};

const create = async (user: TestUser | undefined, body: unknown) => {
  const response = await createAcademy({
    request: apiRequest(BASE, { user, method: "POST", body }),
    params: {},
  });
  if (response.status === 201) {
    const { data } = (await response.clone().json()) as AcademyBody;
    academies.push({ id: data.id, slug: data.slug });
  }
  return response;
};

const appoint = (user: TestUser, academyId: string, body: unknown) =>
  appointAcademyAdmin({
    request: apiRequest(`${BASE}/${academyId}/admins`, {
      user,
      method: "POST",
      body,
    }),
    params: { academyId },
  });

const removeAdmin = (user: TestUser, academyId: string, userId: string) =>
  removeAcademyAdmin({
    request: apiRequest(`${BASE}/${academyId}/admins/${userId}`, {
      user,
      method: "DELETE",
    }),
    params: { academyId, userId },
  });

const remove = (user: TestUser, academyId: string) =>
  deleteAcademy({
    request: apiRequest(`${BASE}/${academyId}`, { user, method: "DELETE" }),
    params: { academyId },
  });

const memberRole = async (
  academyId: string,
  userId: string
): Promise<string | null> =>
  (
    await db.member.findUnique({
      where: { organizationId_userId: { organizationId: academyId, userId } },
      select: { role: true },
    })
  )?.role ?? null;

const newEmail = (label: string): string =>
  `${label}-${runId()}@test.hoops-genesis.local`;

beforeAll(async () => {
  [platformOwner, otherPlatformAdmin] = await Promise.all([
    createTestUser("owner-routes-platform", { platformRole: "admin" }),
    createTestUser("owner-routes-platform2", { platformRole: "admin" }),
  ]);
  [academyAdmin, firstAdmin, coach] = await Promise.all([
    createTestUser("owner-routes-admin"),
    createTestUser("owner-routes-first"),
    createTestUser("owner-routes-coach"),
  ]);
  users.push(
    platformOwner,
    otherPlatformAdmin,
    academyAdmin,
    firstAdmin,
    coach
  );
});

afterAll(async () => {
  await cleanup(academies, users);
});

describe("POST /api/v1/admin/academies", () => {
  it("401 without a session, 403 for anyone but a platform admin (academy admins included)", async () => {
    const existing = await createTestAcademy();
    academies.push(existing);
    await addMember(existing, academyAdmin, "admin");
    expect(
      (await create(undefined, academyBody({ userId: firstAdmin.id }))).status
    ).toBe(401);
    const forbidden = await create(
      academyAdmin,
      academyBody({ userId: firstAdmin.id })
    );
    expect(forbidden.status).toBe(403);
    expect((await readJson<ErrorBody>(forbidden)).error.code).toBe("forbidden");
  });

  it("creates the academy for an existing user: they are its admin, the owner is not a member", async () => {
    const response = await create(
      platformOwner,
      academyBody({ userId: firstAdmin.id })
    );
    expect(response.status).toBe(201);
    const { data } = await readJson<AcademyBody>(response);
    expect(data.firstAdmin).toMatchObject({
      status: "member",
      member: { userId: firstAdmin.id, role: "admin" },
    });
    expect(await memberRole(data.id, firstAdmin.id)).toBe("admin");
    expect(await memberRole(data.id, platformOwner.id)).toBeNull();
    expect(await db.member.count({ where: { organizationId: data.id } })).toBe(
      1
    );
    // No default team, and the Better Auth rules ran (qrNonce, radius).
    expect(await db.team.count({ where: { organizationId: data.id } })).toBe(0);
    const row = await db.organization.findUniqueOrThrow({
      where: { id: data.id },
    });
    expect(row.qrNonce).toHaveLength(43);
    expect(row.attendanceRadiusM).toBe(150);

    // Audited with the owner as actor; academy_id null so it can be deleted.
    const audit = await db.auditLog.findMany({
      where: { entityType: "academy", entityId: data.id },
    });
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      action: "academy.create",
      actorId: platformOwner.id,
      academyId: null,
    });

    // The first admin works the academy through Better Auth as an admin.
    const cookieHeaders = new Headers({ cookie: firstAdmin.cookie });
    const full = await auth.api.getFullOrganization({
      query: { organizationId: data.id },
      headers: cookieHeaders,
    });
    expect(full?.id).toBe(data.id);
  });

  it("invites an email with no account; accepting makes them the admin", async () => {
    const email = newEmail("owner-routes-invitee");
    const response = await create(platformOwner, academyBody({ email }));
    expect(response.status).toBe(201);
    const { data } = await readJson<AcademyBody>(response);
    expect(data.firstAdmin).toMatchObject({
      status: "invited",
      invitation: { email },
    });
    expect(await db.member.count({ where: { organizationId: data.id } })).toBe(
      0
    );

    const { response: signUp, headers } = await auth.api.signUpEmail({
      body: { email, password: "test-password-1234", name: "Invitee" },
      returnHeaders: true,
    });
    const invitee: TestUser = {
      id: signUp.user.id,
      email,
      cookie: headers
        .getSetCookie()
        .map((cookie) => cookie.split(";")[0])
        .join("; "),
    };
    users.push(invitee);
    // The invitation id from the response is what the invitee needs: Better
    // Auth's listUserInvitations and getInvitation refuse here (unverified
    // email; inviter not a member), acceptInvitation does not.
    const invitationId =
      data.firstAdmin.status === "invited" ? data.firstAdmin.invitation.id : "";
    await auth.api.acceptInvitation({
      body: { invitationId },
      headers: new Headers({ cookie: invitee.cookie }),
    });
    expect(await memberRole(data.id, invitee.id)).toBe("admin");
  });

  it("400 for bad fields, 404 for an unknown user, 409 for a taken slug, 422 for a platform admin", async () => {
    const missingCoordinates = academyBody({ userId: firstAdmin.id }) as Record<
      string,
      unknown
    >;
    missingCoordinates.latitude = undefined;
    expect((await create(platformOwner, missingCoordinates)).status).toBe(400);
    expect(
      (
        await create(platformOwner, {
          ...academyBody({ userId: firstAdmin.id }),
          timezone: "Mars/Base",
        })
      ).status
    ).toBe(400);
    expect(
      (
        await create(platformOwner, {
          ...academyBody({ userId: firstAdmin.id, email: "a@b.co" }),
        })
      ).status
    ).toBe(400);
    expect(
      (
        await create(platformOwner, {
          ...academyBody({ userId: firstAdmin.id }),
          qrNonce: "mine",
        })
      ).status
    ).toBe(400);
    const unknownUser = await create(
      platformOwner,
      academyBody({ userId: "no-such-user" })
    );
    expect(unknownUser.status).toBe(404);
    const body = academyBody({ userId: firstAdmin.id });
    expect((await create(platformOwner, body)).status).toBe(201);
    const taken = await create(platformOwner, body);
    expect(taken.status).toBe(409);
    expect((await readJson<ErrorBody>(taken)).error.code).toBe("slug_taken");
    const refused = await Promise.all(
      [platformOwner, otherPlatformAdmin].map((person) =>
        create(platformOwner, academyBody({ userId: person.id }))
      )
    );
    for (const response of refused) {
      expect(response.status).toBe(422);
    }
    const codes = await Promise.all(
      refused.map(
        async (response) => (await readJson<ErrorBody>(response)).error.code
      )
    );
    expect(codes).toEqual([
      "platform_admin_cannot_be_member",
      "platform_admin_cannot_be_member",
    ]);
  });
});

describe("GET /api/v1/admin/academies", () => {
  it("lists every academy newest first with its admins, paginated; platform admins only", async () => {
    const response = await create(
      platformOwner,
      academyBody({ userId: firstAdmin.id })
    );
    const { data: made } = await readJson<AcademyBody>(response);
    const list = (user: TestUser, query = "") =>
      listAcademies({
        request: apiRequest(`${BASE}${query}`, { user }),
        params: {},
      });
    expect((await list(academyAdmin)).status).toBe(403);
    const page = await readJson<{
      data: {
        admins: { userId: string }[];
        id: string;
        memberCount: number;
      }[];
      nextCursor: string | null;
    }>(await list(platformOwner, "?limit=1"));
    expect(page.data).toHaveLength(1);
    expect(page.data[0]).toMatchObject({
      id: made.id,
      memberCount: 1,
      admins: [{ userId: firstAdmin.id }],
    });
    expect(page.nextCursor).not.toBeNull();
    const next = await readJson<{ data: { id: string }[] }>(
      await list(platformOwner, `?limit=1&cursor=${page.nextCursor}`)
    );
    expect(next.data[0]?.id).not.toBe(made.id);
  });
});

describe("appoint and remove academy admins", () => {
  let academy: TestAcademy;

  beforeAll(async () => {
    academy = await createTestAcademy();
    academies.push(academy);
    await addMember(academy, academyAdmin, "admin");
    await addMember(academy, coach, "coach");
    await createTeam(academy, [coach]);
  });

  it("only the platform owner appoints; academy admins get 403", async () => {
    const response = await appoint(academyAdmin, academy.id, {
      userId: coach.id,
    });
    expect(response.status).toBe(403);
    expect(await memberRole(academy.id, coach.id)).toBe("coach");
  });

  it("appoints an existing member (keeping their role) and a new user; audited with academy_id", async () => {
    const promoted = await appoint(platformOwner, academy.id, {
      userId: coach.id,
    });
    expect(promoted.status).toBe(201);
    expect(await memberRole(academy.id, coach.id)).toBe("coach,admin");
    const again = await appoint(platformOwner, academy.id, {
      email: coach.email,
    });
    expect(again.status).toBe(409);
    expect((await readJson<ErrorBody>(again)).error.code).toBe("already_admin");

    const outsider = await createTestUser("owner-routes-new-admin");
    users.push(outsider);
    expect(
      (await appoint(platformOwner, academy.id, { email: outsider.email }))
        .status
    ).toBe(201);
    expect(await memberRole(academy.id, outsider.id)).toBe("admin");
    const audit = await db.auditLog.findMany({
      where: { academyId: academy.id, action: "academy.admin_appoint" },
    });
    expect(audit).toHaveLength(2);
    expect(audit.every((row) => row.actorId === platformOwner.id)).toBe(true);
  });

  it("invites an email with no account, and the owner can cancel it", async () => {
    const email = newEmail("owner-routes-pending");
    const response = await appoint(platformOwner, academy.id, { email });
    expect(response.status).toBe(201);
    const { data } = await readJson<{
      data: { invitation: { id: string }; status: string };
    }>(response);
    expect(data.status).toBe("invited");
    expect((await appoint(platformOwner, academy.id, { email })).status).toBe(
      409
    );
    const cancel = (user: TestUser) =>
      cancelAdminInvitation({
        request: apiRequest(
          `${BASE}/${academy.id}/admin-invitations/${data.invitation.id}`,
          { user, method: "DELETE" }
        ),
        params: { academyId: academy.id, id: data.invitation.id },
      });
    expect((await cancel(academyAdmin)).status).toBe(403);
    expect((await cancel(platformOwner)).status).toBe(204);
    expect(
      (
        await db.invitation.findUniqueOrThrow({
          where: { id: data.invitation.id },
        })
      ).status
    ).toBe("canceled");
    expect((await cancel(platformOwner)).status).toBe(404);
  });

  it("removes an admin: strips the role from a coach, removes an admin-only member and their teams", async () => {
    expect((await removeAdmin(academyAdmin, academy.id, coach.id)).status).toBe(
      403
    );
    expect(
      (await removeAdmin(platformOwner, academy.id, coach.id)).status
    ).toBe(204);
    expect(await memberRole(academy.id, coach.id)).toBe("coach");
    expect(
      (await removeAdmin(platformOwner, academy.id, coach.id)).status
    ).toBe(404);

    const teamId = await createTeam(academy, [academyAdmin]);
    expect(
      (await removeAdmin(platformOwner, academy.id, academyAdmin.id)).status
    ).toBe(204);
    expect(await memberRole(academy.id, academyAdmin.id)).toBeNull();
    expect(
      await db.teamMember.count({ where: { teamId, userId: academyAdmin.id } })
    ).toBe(0);
    const audit = await db.auditLog.findFirst({
      where: { academyId: academy.id, action: "academy.admin_remove" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).toMatchObject({ actorId: platformOwner.id });
    expect(audit?.after).toBeNull();
  });
});

describe("DELETE /api/v1/admin/academies/:academyId", () => {
  it("deletes an academy with no history, audited; 404 afterwards; 403 for academy admins", async () => {
    const response = await create(
      platformOwner,
      academyBody({ userId: firstAdmin.id })
    );
    const { data } = await readJson<AcademyBody>(response);
    expect((await remove(firstAdmin, data.id)).status).toBe(403);
    expect((await remove(platformOwner, data.id)).status).toBe(204);
    expect(
      await db.organization.findUnique({ where: { id: data.id } })
    ).toBeNull();
    expect(await db.member.count({ where: { organizationId: data.id } })).toBe(
      0
    );
    expect((await remove(platformOwner, data.id)).status).toBe(404);
    const audit = await db.auditLog.findMany({
      where: { entityType: "academy", entityId: data.id },
      orderBy: { createdAt: "asc" },
    });
    expect(audit.map((row) => row.action)).toEqual([
      "academy.create",
      "academy.delete",
    ]);

    // The admin audit log finds both under ?academyId=.
    const log = await readJson<{ data: { action: string }[] }>(
      await listAdminAuditLog({
        request: apiRequest(`/api/v1/admin/audit-log?academyId=${data.id}`, {
          user: platformOwner,
        }),
        params: {},
      })
    );
    expect(log.data.map((row) => row.action).sort()).toEqual([
      "academy.create",
      "academy.delete",
    ]);
  });

  it("409 academy_has_history once audit rows (or fees, or records) exist", async () => {
    const response = await create(
      platformOwner,
      academyBody({ userId: firstAdmin.id })
    );
    const { data } = await readJson<AcademyBody>(response);
    // Appointing a second admin writes an audit row for the academy.
    expect(
      (await appoint(platformOwner, data.id, { userId: coach.id })).status
    ).toBe(201);
    const refused = await remove(platformOwner, data.id);
    expect(refused.status).toBe(409);
    const body = await readJson<ErrorBody>(refused);
    expect(body.error.code).toBe("academy_has_history");
    expect(body.error.details).toMatchObject({
      fees: 0,
      records: 0,
      auditRows: 1,
    });
    expect(
      await db.organization.findUnique({ where: { id: data.id } })
    ).not.toBeNull();
  });
});
