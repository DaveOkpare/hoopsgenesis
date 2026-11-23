/**
 * Academy dashboard, a read model over existing tables (no new tables).
 *
 * GET /api/v1/academies/:academyId/dashboard         academy admin
 * GET /api/v1/admin/academies/:academyId/dashboard   platform owner, any academy
 *     (./admin-academy-views.ts)
 *
 * Every figure is for this academy only, with "today" and "this week" in the
 * academy's time zone:
 * - members:          member counts per role (a "coach,student" member counts
 *                     under both) plus the number of distinct members
 * - attendanceThisWeek: Monday to Sunday of the current week; rate is
 *                     (present + late) / (present + late + absent); excused
 *                     rows are left out of the rate; voided rows never count
 * - fees:             outstandingStudents = student members with no paid,
 *                     non-voided fee covering today (the same rule as
 *                     GET /fees/outstanding); overdue = unpaid, non-voided
 *                     fee rows past their due date
 * - recordsAwaitingReview: student records still pending
 * - sessionsToday:    sessions of the academy's events today (cancelled days
 *                     left out), and how many of them take attendance
 */
import { z } from "zod";

import { db } from "../../../services";
import { type AcademyAccessResolver, academyAccessWith } from "../access";
import { ForbiddenError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import { fromPlainDate, toEventDates } from "../serialize";
import { addDays, isSessionDate, todayInTimeZone } from "../time";
import { parseQuery } from "../validation";

const ACADEMY_ROLES = ["admin", "coach", "student"] as const;
const STUDENT_ROLE = "student";
const DAYS_PER_WEEK = 7;
/** getUTCDay: 0 = Sunday; shift so Monday is 0. */
const MONDAY_SHIFT = 6;

/** No query parameters; an empty strict schema rejects stray ones. */
const dashboardQuerySchema = z.object({});

interface StatusCounts {
  absent: number;
  excused: number;
  late: number;
  present: number;
}

/** (present + late) / (present + late + absent), or null with no data. */
export const attendanceRate = (counts: StatusCounts): number | null => {
  const counted = counts.present + counts.late + counts.absent;
  return counted === 0 ? null : (counts.present + counts.late) / counted;
};

/** Monday..Sunday of the week containing `today` (a plain date). */
const weekOf = (today: string): { from: string; to: string } => {
  const daysSinceMonday =
    (fromPlainDate(today).getUTCDay() + MONDAY_SHIFT) % DAYS_PER_WEEK;
  const from = addDays(today, -daysSinceMonday);
  return { from, to: addDays(from, DAYS_PER_WEEK - 1) };
};

const countMembersByRole = async (academyId: string) => {
  const [rows, total] = await Promise.all([
    db.$queryRaw<{ role: string; count: number }[]>`
      SELECT r.role, count(*)::int AS count
      FROM member m,
        unnest(string_to_array(replace(m.role, ' ', ''), ',')) AS r(role)
      WHERE m."organizationId" = ${academyId}
      GROUP BY r.role
    `,
    db.member.count({ where: { organizationId: academyId } }),
  ]);
  const byRole = Object.fromEntries(ACADEMY_ROLES.map((role) => [role, 0]));
  for (const row of rows) {
    if (Object.hasOwn(byRole, row.role)) {
      byRole[row.role] = row.count;
    }
  }
  return { total, byRole };
};

const countAttendance = async (
  academyId: string,
  range: { from: string; to: string }
) => {
  const groups = await db.attendance.groupBy({
    by: ["status"],
    where: {
      academyId,
      voidedAt: null,
      sessionDate: {
        gte: fromPlainDate(range.from),
        lte: fromPlainDate(range.to),
      },
    },
    _count: { _all: true },
  });
  const counts: StatusCounts = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const group of groups) {
    counts[group.status] = group._count._all;
  }
  return { ...range, ...counts, rate: attendanceRate(counts) };
};

const countFees = async (academyId: string, today: string) => {
  const [outstanding, overdue] = await Promise.all([
    db.$queryRaw<{ count: number }[]>`
      SELECT count(*)::int AS count
      FROM member m
      WHERE m."organizationId" = ${academyId}
        AND ${STUDENT_ROLE} = ANY (string_to_array(replace(m.role, ' ', ''), ','))
        AND NOT EXISTS (
          SELECT 1 FROM fee f
          WHERE f.academy_id = ${academyId}
            AND f.student_id = m."userId"
            AND f.paid_at IS NOT NULL
            AND f.voided_at IS NULL
            AND f.period_start <= ${today}::date
            AND f.period_end >= ${today}::date
        )
    `,
    db.fee.count({
      where: {
        academyId,
        paidAt: null,
        voidedAt: null,
        dueDate: { lt: fromPlainDate(today) },
      },
    }),
  ]);
  return { outstandingStudents: outstanding[0]?.count ?? 0, overdue };
};

const countSessionsToday = async (academyId: string, today: string) => {
  const day = fromPlainDate(today);
  const events = await db.calendarEvent.findMany({
    where: {
      academyId,
      startDate: { lte: day },
      OR: [{ endDate: { gte: day } }, { endDate: null, startDate: day }],
    },
    select: {
      startDate: true,
      endDate: true,
      excludedDates: true,
      collectAttendance: true,
    },
  });
  const sessions = events.filter((event) =>
    isSessionDate(toEventDates(event), today)
  );
  return {
    date: today,
    total: sessions.length,
    takingAttendance: sessions.filter((event) => event.collectAttendance)
      .length,
  };
};

/** GET /dashboard for `resolve`'s caller. */
export const getDashboardFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    // No permission names the dashboard; it is the academy admin's view.
    if (!member.seesWholeAcademy) {
      throw new ForbiddenError("Only academy admins see the dashboard");
    }
    parseQuery(dashboardQuerySchema, ctx.request);
    const today = todayInTimeZone(academy.timezone);
    const [
      members,
      attendanceThisWeek,
      fees,
      recordsAwaitingReview,
      sessionsToday,
    ] = await Promise.all([
      countMembersByRole(academy.id),
      countAttendance(academy.id, weekOf(today)),
      countFees(academy.id, today),
      db.studentRecord.count({
        where: { academyId: academy.id, status: "pending" },
      }),
      countSessionsToday(academy.id, today),
    ]);
    return json({
      data: {
        today,
        timezone: academy.timezone,
        members,
        attendanceThisWeek,
        fees,
        recordsAwaitingReview,
        sessionsToday,
      },
    });
  });

export const getDashboard = getDashboardFor(academyAccessWith());
