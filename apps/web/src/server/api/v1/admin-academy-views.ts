/**
 * The platform owner's read-only views of any academy (API endpoints, Access
 * by role: owner "✓ (read-only)" on attendance, fees, events, records, the
 * dashboard and the audit log). The owner is never a member: every academy
 * view below runs the academy endpoint's own query and serialization code
 * with `requireAcademyReadAccess` (../access.ts), whose member sees the whole
 * academy and holds no role, so no write check can pass. Only GET handlers
 * are exported from this file, and only GET is mounted on these paths.
 *
 * All under /api/v1/admin/academies/:academyId, platform admins only (401,
 * 403 for anyone else, 404 for an unknown academy):
 *
 * GET /attendance, /attendance/:id                    as ./attendance.ts
 * GET /fees, /fees/:id, /fees/outstanding             as ./fees.ts
 * GET /events, /events/:id, /events/:id/sessions      as ./events.ts, ./events-sessions.ts
 * GET /records, /records/:id                          as ./records.ts (signed file URL, never the key)
 * GET /students/:studentId/records                    as ./records.ts
 * GET /dashboard                                      as ./dashboard.ts
 * GET /teams/:teamId/attendance-summary               as ./attendance-summary.ts
 * GET /audit-log                                      as ./audit-log.ts, plus the
 *                                                     academy's academy.create/delete rows
 * GET /teams                                          as ./teams.ts, each with `members`
 * GET /members?role=                                  members with name, email, image, roles
 * GET /invitations                                    pending, unexpired invitations
 *
 * And GET /api/v1/admin/users/:userId/memberships (PA-2): a user's
 * academies, roles and teams.
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import { requireAcademyReadAccess, requirePlatformAdmin } from "../access";
import { NotFoundError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import {
  decodeCursor,
  encodeCursor,
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { loadPeople, personRef } from "../people";
import { parseRoles } from "../roles";
import { toTimestamp } from "../serialize";
import { idSchema, parseParams, parseQuery } from "../validation";
import { getAttendanceFor, listAttendanceFor } from "./attendance";
import { getTeamAttendanceSummaryFor } from "./attendance-summary";
import { listAcademyAuditLogFor } from "./audit-log";
import { getDashboardFor } from "./dashboard";
import { getEventFor, listEventsFor } from "./events";
import { listEventSessionsFor } from "./events-sessions";
import { getFeeFor, listFeesFor, listOutstandingFeesFor } from "./fees";
import {
  getRecordFor,
  listRecordQueueFor,
  listStudentRecordsFor,
} from "./records";
import { listTeamsFor } from "./teams";

const ACADEMY_ROLES = ["admin", "coach", "student"] as const;
const PENDING = "pending";

const owner = requireAcademyReadAccess;

// ---------------------------------------------------------------- academy views

export const adminListAttendance: ApiHandler = listAttendanceFor(owner);
export const adminGetAttendance: ApiHandler = getAttendanceFor(owner);
export const adminListFees: ApiHandler = listFeesFor(owner);
export const adminGetFee: ApiHandler = getFeeFor(owner);
export const adminListOutstandingFees: ApiHandler =
  listOutstandingFeesFor(owner);
export const adminListEvents: ApiHandler = listEventsFor(owner);
export const adminGetEvent: ApiHandler = getEventFor(owner);
export const adminListEventSessions: ApiHandler = listEventSessionsFor(owner);
export const adminListRecords: ApiHandler = listRecordQueueFor(owner);
export const adminGetRecord: ApiHandler = getRecordFor(owner);
export const adminListStudentRecords: ApiHandler = listStudentRecordsFor(owner);
export const adminGetDashboard: ApiHandler = getDashboardFor(owner);
export const adminGetTeamAttendanceSummary: ApiHandler =
  getTeamAttendanceSummaryFor(owner);
export const adminListAcademyAuditLog: ApiHandler = listAcademyAuditLogFor(
  owner,
  { includePlatformRows: true }
);
export const adminListTeams: ApiHandler = listTeamsFor(owner, {
  withMembers: true,
});

// ---------------------------------------------------------------- members

const membersQuerySchema = z.object({
  ...paginationQueryShape,
  role: z.enum(ACADEMY_ROLES).optional(),
});

const nameIdCursorSchema = z.tuple([z.string(), z.string().min(1)]);

interface MemberRow {
  createdAt: Date;
  email: string;
  id: string;
  image: string | null;
  name: string;
  role: string;
  userId: string;
}

/**
 * GET /members: the academy's members by name, `?role=` keeps those holding
 * that role (a "coach,student" member matches both). PA-3 "members by role".
 */
export const adminListMembers = apiHandler(async (ctx) => {
  const { academy } = await owner(ctx);
  const query = parseQuery(membersQuerySchema, ctx.request);
  const roleFilter = query.role
    ? Prisma.sql`AND ${query.role} = ANY (string_to_array(replace(m.role, ' ', ''), ','))`
    : Prisma.empty;
  let cursorFilter = Prisma.empty;
  if (query.cursor) {
    const [name, id] = decodeCursor(query.cursor, nameIdCursorSchema);
    cursorFilter = Prisma.sql`AND (u.name, m.id) > (${name}, ${id})`;
  }
  const rows = await db.$queryRaw<MemberRow[]>`
    SELECT m.id, m."userId", m.role, m."createdAt", u.name, u.email, u.image
    FROM member m
    JOIN "user" u ON u.id = m."userId"
    WHERE m."organizationId" = ${academy.id}
      ${roleFilter}
      ${cursorFilter}
    ORDER BY u.name, m.id
    LIMIT ${query.limit + 1}
  `;
  return json(
    toPage(
      rows,
      query.limit,
      (row) => encodeCursor([row.name, row.id]),
      (row) => ({
        memberId: row.id,
        userId: row.userId,
        name: row.name,
        email: row.email,
        image: row.image,
        roles: parseRoles(row.role),
        createdAt: toTimestamp(row.createdAt),
      })
    )
  );
});

// ---------------------------------------------------------------- invitations

const invitationsQuerySchema = z.object({ ...paginationQueryShape });

/**
 * GET /invitations: pending invitations that have not expired, newest first,
 * e.g. the first admin's for "Admin invited" (PA-1).
 */
export const adminListInvitations = apiHandler(async (ctx) => {
  const { academy } = await owner(ctx);
  const query = parseQuery(invitationsQuerySchema, ctx.request);
  const where: Prisma.InvitationWhereInput = {
    organizationId: academy.id,
    status: PENDING,
    expiresAt: { gt: new Date() },
  };
  const rows = await db.invitation.findMany({
    where: {
      AND: [where, timeIdKeysetWhere("createdAt", query.cursor, "desc")],
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const people = await loadPeople(
    db,
    rows.map((row) => row.inviterId)
  );
  return json(
    toPage(
      rows,
      query.limit,
      (row) => encodeTimeIdCursor(row.createdAt, row.id),
      (row) => ({
        id: row.id,
        email: row.email,
        roles: parseRoles(row.role),
        teamIds: row.teamId ? row.teamId.split(",") : [],
        status: row.status,
        createdAt: toTimestamp(row.createdAt),
        expiresAt: toTimestamp(row.expiresAt),
        inviterId: row.inviterId,
        inviter: personRef(people, row.inviterId),
      })
    )
  );
});

// ---------------------------------------------------------------- users

const userParamsSchema = z.object({ userId: idSchema });

/**
 * GET /api/v1/admin/users/:userId/memberships: the academies the user
 * belongs to, with their roles and teams there (PA-2). 404 for an unknown
 * user. Not paginated: a person belongs to few academies.
 */
export const adminListUserMemberships = apiHandler(async (ctx) => {
  await requirePlatformAdmin(ctx.request);
  const { userId } = parseParams(userParamsSchema, ctx.params);
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      role: true,
      banned: true,
    },
  });
  if (!user) {
    throw new NotFoundError("User not found", { code: "user_not_found" });
  }
  const [members, teamRows] = await Promise.all([
    db.member.findMany({
      where: { userId },
      orderBy: [{ organization: { name: "asc" } }, { id: "asc" }],
      select: {
        id: true,
        role: true,
        createdAt: true,
        organization: { select: { id: true, name: true, slug: true } },
      },
    }),
    db.teamMember.findMany({
      where: { userId },
      orderBy: [{ team: { name: "asc" } }, { teamId: "asc" }],
      select: {
        team: {
          select: {
            id: true,
            name: true,
            ageGroup: true,
            organizationId: true,
          },
        },
      },
    }),
  ]);
  const teamsByAcademy = new Map<
    string,
    { id: string; name: string; ageGroup: string | null }[]
  >();
  for (const { team } of teamRows) {
    const list = teamsByAcademy.get(team.organizationId) ?? [];
    list.push({ id: team.id, name: team.name, ageGroup: team.ageGroup });
    teamsByAcademy.set(team.organizationId, list);
  }
  return json({
    data: {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        platformRoles: parseRoles(user.role),
        banned: user.banned ?? false,
      },
      memberships: members.map((member) => ({
        memberId: member.id,
        academy: member.organization,
        roles: parseRoles(member.role),
        joinedAt: toTimestamp(member.createdAt),
        teams: teamsByAcademy.get(member.organization.id) ?? [],
      })),
    },
  });
});
