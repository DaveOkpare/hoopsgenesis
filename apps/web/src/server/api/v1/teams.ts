/**
 * Teams and rosters, read-only. Teams are created and changed through Better
 * Auth (`organization.createTeam`, `addTeamMember`, ...); these endpoints
 * exist because its reads do not cover the app's views in 1.7.12:
 * `listTeamMembers` refuses anyone who is not on that team (so an academy
 * admin cannot open a roster), and `listTeams` strips `memberCount`.
 *
 * Paths are under /api/v1/academies/:academyId.
 *
 * GET /teams                  any member. Academy admins: every team; coaches
 *                             and students: the teams they are on. Each team
 *                             with memberCount, coachCount, studentCount
 *                             (members of the academy on the team).
 * GET /teams/:teamId/members  academy admin: any team of the academy; coach
 *                             and student: only a team they are on, else 404.
 *                             Each member: userId, name, image, roles.
 *
 * Both are ordered by name then id and cursor-paginated. The platform owner
 * reads teams with their members through ./admin-academy-views.ts.
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import { type AcademyAccessResolver, academyAccessWith } from "../access";
import { NotFoundError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import {
  decodeCursor,
  encodeCursor,
  paginationQueryShape,
  toPage,
} from "../pagination";
import { parseRoles } from "../roles";
import {
  type DbClient,
  getTeamIdsForUser,
  isTeamInAcademy,
  isUserOnTeam,
} from "../scope";
import { toNullableTimestamp } from "../serialize";
import { idSchema, parseParams, parseQuery } from "../validation";

const COACH_ROLE = "coach";
const STUDENT_ROLE = "student";

const listQuerySchema = z.object({ ...paginationQueryShape });
const teamParamsSchema = z.object({ teamId: idSchema });
const nameIdCursorSchema = z.tuple([z.string(), z.string().min(1)]);

export interface TeamCounts {
  coachCount: number;
  memberCount: number;
  studentCount: number;
}

export interface RosterMember {
  image: string | null;
  name: string;
  roles: string[];
  userId: string;
}

interface CountRow {
  coaches: number;
  members: number;
  students: number;
  teamId: string;
}

/** Member, coach and student counts per team, one query for all of them. */
export const loadTeamCounts = async (
  client: DbClient,
  academyId: string,
  teamIds: readonly string[]
): Promise<Map<string, TeamCounts>> => {
  const counts = new Map<string, TeamCounts>();
  if (teamIds.length === 0) {
    return counts;
  }
  const rows = await client.$queryRaw<CountRow[]>`
    SELECT tm."teamId" AS "teamId",
      count(*)::int AS members,
      count(*) FILTER (
        WHERE ${COACH_ROLE} = ANY (string_to_array(replace(m.role, ' ', ''), ','))
      )::int AS coaches,
      count(*) FILTER (
        WHERE ${STUDENT_ROLE} = ANY (string_to_array(replace(m.role, ' ', ''), ','))
      )::int AS students
    FROM "teamMember" tm
    JOIN member m ON m."userId" = tm."userId" AND m."organizationId" = ${academyId}
    WHERE tm."teamId" IN (${Prisma.join(teamIds)})
    GROUP BY tm."teamId"
  `;
  for (const row of rows) {
    counts.set(row.teamId, {
      memberCount: row.members,
      coachCount: row.coaches,
      studentCount: row.students,
    });
  }
  return counts;
};

interface RosterRow {
  image: string | null;
  name: string;
  role: string;
  teamId: string;
  userId: string;
}

/**
 * The academy members on each of `teamIds`, by name then id. With `page`,
 * one team only, `limit + 1` rows after `cursor`.
 */
const queryRosterRows = (
  client: DbClient,
  academyId: string,
  teamIds: readonly string[],
  page?: { limit: number; cursor?: string }
): Promise<RosterRow[]> => {
  let cursorFilter = Prisma.empty;
  if (page?.cursor) {
    const [name, id] = decodeCursor(page.cursor, nameIdCursorSchema);
    cursorFilter = Prisma.sql`AND (u.name, u.id) > (${name}, ${id})`;
  }
  const limit = page ? Prisma.sql`LIMIT ${page.limit + 1}` : Prisma.empty;
  return client.$queryRaw<RosterRow[]>`
    SELECT tm."teamId" AS "teamId", u.id AS "userId", u.name, u.image, m.role
    FROM "teamMember" tm
    JOIN "user" u ON u.id = tm."userId"
    JOIN member m ON m."userId" = tm."userId" AND m."organizationId" = ${academyId}
    WHERE tm."teamId" IN (${Prisma.join(teamIds)})
      ${cursorFilter}
    ORDER BY u.name, u.id
    ${limit}
  `;
};

const toRosterMember = (row: RosterRow): RosterMember => ({
  userId: row.userId,
  name: row.name,
  image: row.image,
  roles: parseRoles(row.role),
});

/** Every team's roster (not paginated), for the owner's teams view. */
export const loadRosters = async (
  client: DbClient,
  academyId: string,
  teamIds: readonly string[]
): Promise<Map<string, RosterMember[]>> => {
  const rosters = new Map<string, RosterMember[]>();
  if (teamIds.length === 0) {
    return rosters;
  }
  for (const row of await queryRosterRows(client, academyId, teamIds)) {
    const list = rosters.get(row.teamId) ?? [];
    list.push(toRosterMember(row));
    rosters.set(row.teamId, list);
  }
  return rosters;
};

const teamSelect = {
  id: true,
  name: true,
  ageGroup: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * GET /teams for `resolve`'s caller. `withMembers` (the platform owner's
 * view) adds each team's full roster as `members`.
 */
export const listTeamsFor = (
  resolve: AcademyAccessResolver,
  options: { withMembers: boolean }
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const query = parseQuery(listQuerySchema, ctx.request);
    const visible: Prisma.TeamWhereInput = member.seesWholeAcademy
      ? {}
      : {
          id: {
            in: await getTeamIdsForUser(db, academy.id, member.userId),
          },
        };
    let after: Prisma.TeamWhereInput = {};
    if (query.cursor) {
      const [name, id] = decodeCursor(query.cursor, nameIdCursorSchema);
      after = { OR: [{ name: { gt: name } }, { name, id: { gt: id } }] };
    }
    const teams = await db.team.findMany({
      where: { AND: [{ organizationId: academy.id }, visible, after] },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      take: query.limit + 1,
      select: teamSelect,
    });
    const ids = teams.slice(0, query.limit).map((team) => team.id);
    const [counts, rosters] = await Promise.all([
      loadTeamCounts(db, academy.id, ids),
      options.withMembers
        ? loadRosters(db, academy.id, ids)
        : Promise.resolve(null),
    ]);
    return json(
      toPage(
        teams,
        query.limit,
        (team) => encodeCursor([team.name, team.id]),
        (team) => ({
          id: team.id,
          academyId: academy.id,
          name: team.name,
          ageGroup: team.ageGroup,
          createdAt: toNullableTimestamp(team.createdAt),
          updatedAt: toNullableTimestamp(team.updatedAt),
          ...(counts.get(team.id) ?? {
            memberCount: 0,
            coachCount: 0,
            studentCount: 0,
          }),
          ...(rosters ? { members: rosters.get(team.id) ?? [] } : {}),
        })
      )
    );
  });

/** GET /teams/:teamId/members for `resolve`'s caller. */
export const listTeamMembersFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { teamId } = parseParams(teamParamsSchema, ctx.params);
    const visible = member.seesWholeAcademy
      ? await isTeamInAcademy(db, academy.id, teamId)
      : await isUserOnTeam(db, academy.id, member.userId, teamId);
    if (!visible) {
      throw new NotFoundError("Team not found");
    }
    const query = parseQuery(listQuerySchema, ctx.request);
    const rows = await queryRosterRows(db, academy.id, [teamId], query);
    return json(
      toPage(
        rows,
        query.limit,
        (row) => encodeCursor([row.name, row.userId]),
        toRosterMember
      )
    );
  });

const anyMember = academyAccessWith();

export const listTeams = listTeamsFor(anyMember, { withMembers: false });
export const listTeamMembers = listTeamMembersFor(anyMember);
