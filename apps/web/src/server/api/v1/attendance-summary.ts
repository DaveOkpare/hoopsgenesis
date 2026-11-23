/**
 * Attendance rate per student for one team, a read model (no new tables).
 *
 * GET /api/v1/academies/:academyId/teams/:teamId/attendance-summary?from=&to=
 *   coach on that team, academy admin; the platform owner through
 *   ./admin-academy-views.ts
 *
 * Students: the team's current student members. Rows counted: their
 * non-voided attendance with sessionDate in from..to (academy-local dates,
 * both inclusive), at this team's events and at academy-wide events. Rows
 * from another team's events (say, before the student moved) are left out.
 * Rate = (present + late) / (present + late + absent); excused rows are shown
 * but left out of the rate; null when nothing counts. Not paginated: a team
 * roster is small and the response is one row per student.
 */
import { z } from "zod";

import { db } from "../../../services";
import { type AcademyAccessResolver, academyAccessWith } from "../access";
import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import { plainDateRange } from "../serialize";
import { daysBetween, MAX_SESSION_RANGE_DAYS } from "../time";
import {
  idSchema,
  isoDateSchema,
  parseParams,
  parseQuery,
} from "../validation";
import { attendanceRate } from "./dashboard";
import { isCoachOnTeam } from "./events-shared";

const STUDENT_ROLE = "student";

const paramsSchema = z.object({ teamId: idSchema });
const querySchema = z.object({ from: isoDateSchema, to: isoDateSchema });

interface StudentSummary {
  absent: number;
  excused: number;
  late: number;
  name: string;
  present: number;
  rate: number | null;
  studentId: string;
  total: number;
}

/** GET /teams/:teamId/attendance-summary for `resolve`'s caller. */
export const getTeamAttendanceSummaryFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { teamId } = parseParams(paramsSchema, ctx.params);
    const query = parseQuery(querySchema, ctx.request);
    if (query.from > query.to) {
      throw new ValidationError("from must be on or before to", {
        code: "invalid_range",
      });
    }
    if (daysBetween(query.from, query.to) >= MAX_SESSION_RANGE_DAYS) {
      throw new ValidationError(
        `from..to can span at most ${MAX_SESSION_RANGE_DAYS} days`,
        { code: "range_too_long" }
      );
    }
    const team = await db.team.findFirst({
      where: { id: teamId, organizationId: academy.id },
      select: { id: true, name: true },
    });
    if (!team) {
      throw new NotFoundError("Team not found");
    }
    // Students hold attendance:read for their own rows only; this view is for
    // the team's coaches and the academy's admins.
    if (
      !(member.seesWholeAcademy || (await isCoachOnTeam(db, member, teamId)))
    ) {
      throw new ForbiddenError(
        "Only a coach of this team or an academy admin can see its summary"
      );
    }
    const students = await db.$queryRaw<{ id: string; name: string }[]>`
    SELECT u.id, u.name
    FROM "teamMember" tm
    JOIN "user" u ON u.id = tm."userId"
    JOIN member m ON m."userId" = tm."userId" AND m."organizationId" = ${academy.id}
     AND ${STUDENT_ROLE} = ANY (string_to_array(replace(m.role, ' ', ''), ','))
    WHERE tm."teamId" = ${teamId}
    ORDER BY u.name, u.id
  `;
    const groups =
      students.length === 0
        ? []
        : await db.attendance.groupBy({
            by: ["studentId", "status"],
            where: {
              academyId: academy.id,
              studentId: { in: students.map((student) => student.id) },
              voidedAt: null,
              sessionDate: plainDateRange(query),
              event: { OR: [{ teamId }, { teamId: null }] },
            },
            _count: { _all: true },
          });
    const byStudent = new Map<string, StudentSummary>(
      students.map((student) => [
        student.id,
        {
          studentId: student.id,
          name: student.name,
          present: 0,
          late: 0,
          absent: 0,
          excused: 0,
          total: 0,
          rate: null,
        },
      ])
    );
    for (const group of groups) {
      const summary = byStudent.get(group.studentId);
      if (summary) {
        summary[group.status] = group._count._all;
        summary.total += group._count._all;
      }
    }
    const rows = [...byStudent.values()].map((summary) => ({
      ...summary,
      rate: attendanceRate(summary),
    }));
    const totals = rows.reduce(
      (sum, row) => ({
        present: sum.present + row.present,
        late: sum.late + row.late,
        absent: sum.absent + row.absent,
        excused: sum.excused + row.excused,
      }),
      { present: 0, late: 0, absent: 0, excused: 0 }
    );
    return json({
      data: {
        teamId: team.id,
        teamName: team.name,
        from: query.from,
        to: query.to,
        team: { ...totals, rate: attendanceRate(totals) },
        students: rows,
      },
    });
  });

export const getTeamAttendanceSummary = getTeamAttendanceSummaryFor(
  academyAccessWith({ attendance: ["read"] })
);
