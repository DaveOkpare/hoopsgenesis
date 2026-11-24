/*
 * Attendance overview for academy admins (AO-7) and coaches (CO-7). Convention: see
 * features/viewer/api.ts; the fixture twin is ./api.mock.ts (dev preview only).
 *
 * Built from:
 *   GET /events?from&to&includeCancelled=true          the sessions (features/calendar)
 *   GET /teams + rosters                               teams, sizes, coaches
 *   GET /attendance?from&to[&teamId]                   rows (voided rows left out)
 *   GET /teams/:teamId/attendance-summary?from&to      team and student rates, the same
 *                                                      numbers the team pages show
 *   GET /fees/outstanding[?teamId]                     "Fees 23 days late" (coach)
 * Rates follow the server: (present + late) / (present + late + absent); excused rows
 * don't count. A session is "not closed" once it has ended and some student on the
 * team has no row for it.
 */
import {
  type CalendarItem,
  type CalendarTeam,
  listCalendarItems,
  listCalendarTeams,
} from "@/features/calendar/api";
import type {
  AttendanceStatus,
  DateOnly,
  Id,
  Timestamp,
} from "@/features/types";
import { academyPath, apiAll, apiData, isApiError } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface DateRange {
  from: DateOnly;
  to: DateOnly;
}

export interface StatusCounts {
  absent: number;
  excused: number;
  late: number;
  present: number;
}

/** One session (a day of an event that takes attendance) with its counts. */
export interface SessionSummary {
  cancelled: boolean;
  counts: StatusCounts;
  /** Ended (or cancelled) before now. */
  ended: boolean;
  eventId: Id;
  eventType: string;
  key: string;
  /** Students on the team with no row; null when the team size is unknown. */
  neverCheckedIn: number | null;
  /** Students on the team now; null for an academy-wide session. */
  roster: number | null;
  sessionDate: DateOnly;
  startTime: string | null;
  teamId: Id;
  title: string;
}

export interface TeamRate {
  /** Rate over the calendar month the period ends in. */
  monthRate: number | null;
  /** Rate over the selected week or month. */
  periodRate: number | null;
  team: CalendarTeam;
}

export interface StudentAttendance {
  absent: number;
  /** present + late + absent */
  counted: number;
  /** Days the student's fee is overdue (coach view only); null when paid up. */
  feesOverdueDays: number | null;
  /** Last session they were present or late at, in the loaded range. */
  lastSeen: DateOnly | null;
  late: number;
  name: string;
  rate: number | null;
  /** Status per session key in the period (coach phone grid). */
  statuses: Record<string, AttendanceStatus>;
  studentId: Id;
  teamId: Id;
}

export interface AcademyAttendance {
  counts: StatusCounts;
  /** Month the "Missed the most" table covers, with its students. */
  missed: StudentAttendance[];
  /** Students missing 2 or more sessions in the period. */
  missedTwoPlus: number;
  previousCounts: StatusCounts;
  sessions: SessionSummary[];
  studentCount: number;
  teams: TeamRate[];
}

export interface TeamAttendance {
  counts: StatusCounts;
  previousCounts: StatusCounts;
  sessions: SessionSummary[];
  students: StudentAttendance[];
  teamId: Id;
}

export interface AttendanceRanges {
  month: DateRange;
  period: DateRange;
  previous: DateRange;
}

// ---------------------------------------------------------------- server shapes

interface AttendanceRow {
  eventId: Id;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  student: { id: Id; name: string } | null;
  studentId: Id;
  voidedAt: Timestamp | null;
}

interface SummaryStudent {
  absent: number;
  excused: number;
  late: number;
  name: string;
  present: number;
  rate: number | null;
  studentId: Id;
}

interface TeamSummary {
  students: SummaryStudent[];
  team: StatusCounts & { rate: number | null };
}

interface OutstandingRow {
  daysOverdue: number | null;
  student: { id: Id };
}

// ---------------------------------------------------------------- helpers

export const EMPTY_COUNTS: StatusCounts = {
  present: 0,
  late: 0,
  absent: 0,
  excused: 0,
};

function countRows(rows: AttendanceRow[]): StatusCounts {
  const counts = { ...EMPTY_COUNTS };
  for (const row of rows) {
    counts[row.status] += 1;
  }
  return counts;
}

async function listRows(
  academyId: Id,
  range: DateRange,
  teamId?: Id
): Promise<AttendanceRow[]> {
  const rows = await apiAll<AttendanceRow>(
    academyPath(academyId, "/attendance"),
    {
      query: { from: range.from, to: range.to, ...(teamId ? { teamId } : {}) },
      maxItems: 20_000,
    }
  );
  return rows.filter((row) => row.voidedAt === null);
}

function getSummary(
  academyId: Id,
  teamId: Id,
  range: DateRange
): Promise<TeamSummary> {
  return apiData<TeamSummary>(
    academyPath(academyId, `/teams/${teamId}/attendance-summary`),
    { query: { from: range.from, to: range.to } }
  );
}

function sessionKey(eventId: Id, date: DateOnly): string {
  return `${eventId}:${date}`;
}

function ended(item: CalendarItem, now: Date): boolean {
  if (item.endsAt) {
    return Date.parse(item.endsAt) < now.getTime();
  }
  return item.startsAt ? Date.parse(item.startsAt) < now.getTime() : false;
}

/** Team sessions that take attendance, with their counts, newest first. */
export function summariseSessions(
  items: CalendarItem[],
  rows: AttendanceRow[],
  teams: Map<Id, CalendarTeam>,
  now: Date
): SessionSummary[] {
  const byKey = new Map<string, AttendanceRow[]>();
  for (const row of rows) {
    const key = sessionKey(row.eventId, row.sessionDate);
    const list = byKey.get(key);
    if (list) {
      list.push(row);
    } else {
      byKey.set(key, [row]);
    }
  }
  return items
    .filter((item) => item.collectAttendance && item.teamId !== null)
    .map((item) => {
      const sessionRows = byKey.get(item.key) ?? [];
      const roster = item.teamId
        ? (teams.get(item.teamId)?.studentCount ?? null)
        : null;
      const recorded = new Set(sessionRows.map((row) => row.studentId)).size;
      return {
        key: item.key,
        eventId: item.eventId,
        teamId: item.teamId ?? "",
        title: item.title,
        eventType: item.eventType,
        sessionDate: item.sessionDate,
        startTime: item.startTime,
        cancelled: item.cancelled,
        ended: item.cancelled || ended(item, now),
        counts: countRows(sessionRows),
        roster,
        neverCheckedIn: roster === null ? null : Math.max(0, roster - recorded),
      };
    })
    .sort((a, b) =>
      `${b.sessionDate}${b.startTime ?? ""}`.localeCompare(
        `${a.sessionDate}${a.startTime ?? ""}`
      )
    );
}

function lastSeenByStudent(rows: AttendanceRow[]): Map<Id, DateOnly> {
  const seen = new Map<Id, DateOnly>();
  for (const row of rows) {
    if (row.status !== "present" && row.status !== "late") {
      continue;
    }
    const current = seen.get(row.studentId);
    if (!current || row.sessionDate > current) {
      seen.set(row.studentId, row.sessionDate);
    }
  }
  return seen;
}

function statusesByStudent(
  rows: AttendanceRow[]
): Map<Id, Record<string, AttendanceStatus>> {
  const result = new Map<Id, Record<string, AttendanceStatus>>();
  for (const row of rows) {
    const statuses = result.get(row.studentId) ?? {};
    statuses[sessionKey(row.eventId, row.sessionDate)] = row.status;
    result.set(row.studentId, statuses);
  }
  return result;
}

function toStudents(
  summary: TeamSummary,
  teamId: Id,
  rows: AttendanceRow[],
  fees: Map<Id, number>
): StudentAttendance[] {
  const seen = lastSeenByStudent(rows);
  const statuses = statusesByStudent(rows);
  return summary.students.map((student) => ({
    studentId: student.studentId,
    name: student.name,
    teamId,
    absent: student.absent,
    late: student.late,
    counted: student.present + student.late + student.absent,
    rate: student.rate,
    lastSeen: seen.get(student.studentId) ?? null,
    statuses: statuses.get(student.studentId) ?? {},
    feesOverdueDays: fees.get(student.studentId) ?? null,
  }));
}

/** Most absences first, then lowest rate, then name. */
export function byMostMissed(
  a: StudentAttendance,
  b: StudentAttendance
): number {
  return (
    b.absent - a.absent ||
    (a.rate ?? 1) - (b.rate ?? 1) ||
    a.name.localeCompare(b.name)
  );
}

function sameRange(a: DateRange, b: DateRange): boolean {
  return a.from === b.from && a.to === b.to;
}

// ---------------------------------------------------------------- admin

/** The academy admin's overview (AO-7, Paper 8EI-0 / 7KA-0). */
export async function getAcademyAttendance(
  academyId: Id,
  params: AttendanceRanges & { teamId?: Id; now: Timestamp }
): Promise<AcademyAttendance> {
  if (mock) {
    return (await mock()).getAcademyAttendance(academyId, params);
  }
  const now = new Date(params.now);
  const allTeams = await listCalendarTeams(academyId);
  const teams = params.teamId
    ? allTeams.filter((team) => team.id === params.teamId)
    : allTeams;
  const teamIndex = new Map(allTeams.map((team) => [team.id, team]));
  const monthIsPeriod = sameRange(params.month, params.period);
  const [
    items,
    rows,
    previousRows,
    monthRows,
    periodSummaries,
    monthSummaries,
  ] = await Promise.all([
    listCalendarItems(academyId, params.period),
    listRows(academyId, params.period, params.teamId),
    listRows(academyId, params.previous, params.teamId),
    monthIsPeriod ? null : listRows(academyId, params.month, params.teamId),
    Promise.all(
      teams.map((team) => getSummary(academyId, team.id, params.period))
    ),
    monthIsPeriod
      ? null
      : Promise.all(
          teams.map((team) => getSummary(academyId, team.id, params.month))
        ),
  ]);
  const monthly = monthSummaries ?? periodSummaries;
  const absentByStudent = new Map<Id, number>();
  for (const row of rows) {
    if (row.status === "absent") {
      absentByStudent.set(
        row.studentId,
        (absentByStudent.get(row.studentId) ?? 0) + 1
      );
    }
  }
  const MISSED_THRESHOLD = 2;
  const sessions = summariseSessions(
    items.filter((item) => !params.teamId || item.teamId === params.teamId),
    rows,
    teamIndex,
    now
  );
  return {
    counts: countRows(rows),
    previousCounts: countRows(previousRows),
    missedTwoPlus: [...absentByStudent.values()].filter(
      (count) => count >= MISSED_THRESHOLD
    ).length,
    sessions,
    studentCount: teams.reduce((sum, team) => sum + team.studentCount, 0),
    teams: teams.map((team, index) => ({
      team,
      periodRate: periodSummaries[index]?.team.rate ?? null,
      monthRate: monthly[index]?.team.rate ?? null,
    })),
    missed: teams
      .flatMap((team, index) => {
        const summary = monthly[index];
        return summary
          ? toStudents(summary, team.id, monthRows ?? rows, new Map())
          : [];
      })
      .sort(byMostMissed),
  };
}

// ---------------------------------------------------------------- coach

async function overdueFees(
  academyId: Id,
  teamId: Id
): Promise<Map<Id, number>> {
  try {
    const rows = await apiAll<OutstandingRow>(
      academyPath(academyId, "/fees/outstanding"),
      { query: { teamId } }
    );
    const result = new Map<Id, number>();
    for (const row of rows) {
      if (row.daysOverdue && row.daysOverdue > 0) {
        result.set(row.student.id, row.daysOverdue);
      }
    }
    return result;
  } catch (error) {
    // Fees are an extra on this screen: without fee access, show no fee notes.
    if (isApiError(error) && error.status === 403) {
      return new Map();
    }
    throw error;
  }
}

/** One team for its coach (CO-7, Paper 8WB-0 / C8S-0). */
export async function getTeamAttendance(
  academyId: Id,
  teamId: Id,
  params: AttendanceRanges & { now: Timestamp }
): Promise<TeamAttendance> {
  if (mock) {
    return (await mock()).getTeamAttendance(academyId, teamId, params);
  }
  const now = new Date(params.now);
  const [teams, items, rows, summary, previous, fees] = await Promise.all([
    listCalendarTeams(academyId),
    listCalendarItems(academyId, params.period),
    listRows(academyId, params.period, teamId),
    getSummary(academyId, teamId, params.period),
    getSummary(academyId, teamId, params.previous),
    overdueFees(academyId, teamId),
  ]);
  const teamIndex = new Map(teams.map((team) => [team.id, team]));
  return {
    teamId,
    counts: summary.team,
    previousCounts: previous.team,
    sessions: summariseSessions(
      items.filter((item) => item.teamId === teamId),
      rows,
      teamIndex,
      now
    ),
    students: toStudents(summary, teamId, rows, fees).sort((a, b) =>
      a.name.localeCompare(b.name)
    ),
  };
}
