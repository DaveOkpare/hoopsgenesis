/**
 * Check 4, scope: which rows a member may see or change, always inside one
 * academy. Permissions (./roles.ts) say what a role may do; these say to whom.
 *
 * - academy admin (and read-only viewers, `member.seesWholeAcademy`): the
 *   whole academy
 * - coach: students on the teams the coach is on
 * - student: their own rows
 *
 * Every helper takes `client`, which is `db` or a transaction `tx`, so it can
 * run inside the same transaction as a write.
 *
 * member.role can be comma-separated, so SQL matches roles with
 * string_to_array, never `role = 'coach'`.
 */
import type { TransactionClient } from "@hoops-genesis/db/prisma";

import type { db } from "../../services";
import { NotFoundError } from "./errors";
import { type AcademyMember, parseRoles } from "./roles";

export type DbClient = typeof db | TransactionClient;

/** "all" = the whole academy; otherwise exactly these student ids. */
export type StudentScope = "all" | readonly string[];

const STUDENT_ROLE = "student";
const COACH_ROLE = "coach";

/** Ids of the academy's teams that `userId` is on (for a coach: their teams). */
export const getTeamIdsForUser = async (
  client: DbClient,
  academyId: string,
  userId: string
): Promise<string[]> => {
  const rows = await client.teamMember.findMany({
    where: { userId, team: { organizationId: academyId } },
    select: { teamId: true },
  });
  return rows.map((row) => row.teamId);
};

/** Ids of the student members of the academy on any team `coachId` is on. */
export const getStudentIdsForCoach = async (
  client: DbClient,
  academyId: string,
  coachId: string
): Promise<string[]> => {
  const rows = await client.$queryRaw<{ userId: string }[]>`
    SELECT DISTINCT s."userId"
    FROM "teamMember" c
    JOIN team t ON t.id = c."teamId" AND t."organizationId" = ${academyId}
    JOIN "teamMember" s ON s."teamId" = c."teamId"
    JOIN member m ON m."userId" = s."userId" AND m."organizationId" = ${academyId}
     AND ${STUDENT_ROLE} = ANY (string_to_array(replace(m.role, ' ', ''), ','))
    WHERE c."userId" = ${coachId}
  `;
  return rows.map((row) => row.userId);
};

/**
 * Is `coachId` a coach member of the academy, on a team that `studentId`
 * (a student member of the same academy) is also on?
 */
export const isCoachOfStudent = async (
  client: DbClient,
  academyId: string,
  coachId: string,
  studentId: string
): Promise<boolean> => {
  const rows = await client.$queryRaw<{ found: number }[]>`
    SELECT 1 AS found
    FROM "teamMember" c
    JOIN team t ON t.id = c."teamId" AND t."organizationId" = ${academyId}
    JOIN "teamMember" s ON s."teamId" = c."teamId" AND s."userId" = ${studentId}
    JOIN member cm ON cm."userId" = c."userId" AND cm."organizationId" = ${academyId}
     AND ${COACH_ROLE} = ANY (string_to_array(replace(cm.role, ' ', ''), ','))
    JOIN member sm ON sm."userId" = s."userId" AND sm."organizationId" = ${academyId}
     AND ${STUDENT_ROLE} = ANY (string_to_array(replace(sm.role, ' ', ''), ','))
    WHERE c."userId" = ${coachId}
    LIMIT 1
  `;
  return rows.length > 0;
};

/** Is `userId` on `teamId`, and does that team belong to the academy? */
export const isUserOnTeam = async (
  client: DbClient,
  academyId: string,
  userId: string,
  teamId: string
): Promise<boolean> => {
  const row = await client.teamMember.findFirst({
    where: { teamId, userId, team: { organizationId: academyId } },
    select: { id: true },
  });
  return row !== null;
};

/** Does `teamId` exist in this academy? */
export const isTeamInAcademy = async (
  client: DbClient,
  academyId: string,
  teamId: string
): Promise<boolean> => {
  const row = await client.team.findFirst({
    where: { id: teamId, organizationId: academyId },
    select: { id: true },
  });
  return row !== null;
};

/** Is `userId` a member of the academy holding the student role? */
export const isStudentOfAcademy = async (
  client: DbClient,
  academyId: string,
  userId: string
): Promise<boolean> => {
  const row = await client.member.findUnique({
    where: { organizationId_userId: { organizationId: academyId, userId } },
    select: { role: true },
  });
  return parseRoles(row?.role).includes(STUDENT_ROLE);
};

/**
 * The students whose rows `member` may see. Roles combine: a coach who is
 * also a student sees their teams' students and themself.
 *
 * Use it to narrow list queries:
 * `...(scope === "all" ? {} : { studentId: { in: [...scope] } })`.
 */
export const getStudentScope = async (
  client: DbClient,
  member: AcademyMember
): Promise<StudentScope> => {
  if (member.seesWholeAcademy) {
    return "all";
  }
  const ids = new Set<string>();
  if (member.isCoach) {
    for (const id of await getStudentIdsForCoach(
      client,
      member.academyId,
      member.userId
    )) {
      ids.add(id);
    }
  }
  if (member.isStudent) {
    ids.add(member.userId);
  }
  return [...ids];
};

/** May `member` see rows about `studentId`? (Single-row version of the above.) */
export const canSeeStudent = async (
  client: DbClient,
  member: AcademyMember,
  studentId: string
): Promise<boolean> => {
  if (member.seesWholeAcademy) {
    return true;
  }
  if (member.isStudent && member.userId === studentId) {
    return true;
  }
  return (
    member.isCoach &&
    (await isCoachOfStudent(client, member.academyId, member.userId, studentId))
  );
};

/**
 * A `?teamId=` filter must name a team of this academy that the caller may
 * see: whole-academy readers any team, others only teams they are on.
 * Otherwise 404.
 */
export const requireVisibleTeam = async (
  client: DbClient,
  member: AcademyMember,
  teamId: string
): Promise<void> => {
  const visible = member.seesWholeAcademy
    ? await isTeamInAcademy(client, member.academyId, teamId)
    : await isUserOnTeam(client, member.academyId, member.userId, teamId);
  if (!visible) {
    throw new NotFoundError("Team not found");
  }
};
