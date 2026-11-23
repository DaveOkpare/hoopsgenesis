/*
 * The admin dashboard's own read model (story AO-7). It reads the shared fixtures
 * directly instead of importing other features, so the fees and records modules can
 * change without touching it. Mock-data convention: see features/viewer/api.ts.
 */
import {
  expiredInvitesSummary,
  outstandingSummary,
  pendingRecordsSummary,
  sessionStats,
  unclosedSession,
  weeklyAttendancePercent,
} from "@/features/dashboard/fixtures";
import {
  events,
  FIXTURE_NOW,
  fixtureDelay,
  members,
  outstandingFees,
  studentRecords,
  teams,
  users,
} from "@/features/fixtures";
import type {
  DateOnly,
  Id,
  Money,
  TimeOfDay,
  Timestamp,
} from "@/features/types";

/** "Now" for the dashboard. Fixtures are drawn at FIXTURE_NOW; real: `new Date()`. */
export function referenceNow(): Date {
  return FIXTURE_NOW;
}

function teamName(teamId: Id | null): string | null {
  return teams.find((t) => t.id === teamId)?.name ?? null;
}

function userName(userId: Id): string {
  return users.find((u) => u.id === userId)?.name ?? "Unknown";
}

export interface DashboardSummary {
  attendance: {
    changePts: number;
    thisWeekPercent: number;
    /** Oldest first; the last entry is this week. */
    weeklyPercent: number[];
  };
  expiredInvites: { coaches: number; students: number };
  outstanding: {
    periodStart: DateOnly;
    studentCount: number;
    topTeam: { count: number; name: string } | null;
    total: Money;
  };
  records: {
    oldest: { createdAt: Timestamp; label: string; studentName: string } | null;
    pendingCount: number;
  };
  unclosedSession: {
    missingCheckIns: number;
    sessionDate: DateOnly;
    teamName: string | null;
    title: string;
  } | null;
}

function recordLabel(record: (typeof studentRecords)[number]): string {
  if (record.data.kind === "report_card") {
    return "report card";
  }
  return record.recordType === "academic" ? "academic record" : "result";
}

/** Real: `GET /api/v1/academies/:academyId/dashboard`. */
export async function getDashboard(academyId: Id): Promise<DashboardSummary> {
  await fixtureDelay();
  const weekly = [...weeklyAttendancePercent];
  const thisWeek = weekly.at(-1) ?? 0;
  const lastWeek = weekly.at(-2) ?? thisWeek;
  const oldest = studentRecords.find(
    (r) =>
      r.academyId === academyId && r.id === pendingRecordsSummary.oldestRecordId
  );
  const topTeam = teamName(outstandingSummary.topTeam.teamId);
  return {
    attendance: {
      thisWeekPercent: thisWeek,
      changePts: thisWeek - lastWeek,
      weeklyPercent: weekly,
    },
    outstanding: {
      studentCount: outstandingSummary.studentCount,
      total: { ...outstandingSummary.total },
      periodStart: outstandingSummary.periodStart,
      topTeam: topTeam
        ? { name: topTeam, count: outstandingSummary.topTeam.count }
        : null,
    },
    records: {
      pendingCount: pendingRecordsSummary.count,
      oldest: oldest
        ? {
            studentName: userName(oldest.studentId),
            label: recordLabel(oldest),
            createdAt: oldest.createdAt,
          }
        : null,
    },
    unclosedSession: {
      teamName: teamName(unclosedSession.teamId),
      title: unclosedSession.title,
      sessionDate: unclosedSession.sessionDate,
      missingCheckIns: unclosedSession.missingCheckIns,
    },
    expiredInvites: { ...expiredInvitesSummary },
  };
}

export interface TodaySession {
  checkedIn: number | null;
  collectAttendance: boolean;
  endTime: TimeOfDay | null;
  eventId: Id;
  live: boolean;
  location: string | null;
  rosterSize: number | null;
  startTime: TimeOfDay | null;
  teamName: string | null;
  title: string;
}

/**
 * Today's sessions with live check-in counts.
 * Real: `GET /events?from=today&to=today` + `GET /attendance?date=today` counts.
 */
export async function listTodaySessions(
  academyId: Id,
  date: DateOnly
): Promise<TodaySession[]> {
  await fixtureDelay();
  return events
    .filter((e) => e.academyId === academyId && e.startDate === date)
    .sort((a, b) => (a.startTime ?? "").localeCompare(b.startTime ?? ""))
    .map((e) => {
      const stats = sessionStats[e.id];
      return {
        eventId: e.id,
        title: e.title,
        teamName: teamName(e.teamId),
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        collectAttendance: e.collectAttendance,
        live: stats?.live ?? false,
        checkedIn: stats?.checkedIn ?? null,
        rosterSize: stats?.rosterSize ?? null,
      };
    });
}

export interface UnpaidStudent {
  amount: Money;
  dueDate: DateOnly;
  /** When the student joined the academy (shown when they never paid). */
  joinedAt: Timestamp | null;
  lastPaidAt: Timestamp | null;
  studentId: Id;
  studentName: string;
  teamId: Id | null;
  teamName: string | null;
}

export interface UnpaidPage {
  data: UnpaidStudent[];
  /** Everyone unpaid, not just the rows returned. */
  total: number;
}

/** Real: `GET /api/v1/academies/:academyId/fees/outstanding?teamId=&limit=4`. */
export async function listUnpaidStudents(
  academyId: Id,
  params: { teamId: Id | null }
): Promise<UnpaidPage> {
  await fixtureDelay();
  const rows = outstandingFees
    .filter((row) => params.teamId === null || row.teamId === params.teamId)
    .map((row): UnpaidStudent => {
      const member = members.find(
        (m) => m.academyId === academyId && m.userId === row.studentId
      );
      return {
        studentId: row.studentId,
        studentName: userName(row.studentId),
        teamId: row.teamId,
        teamName: teamName(row.teamId),
        lastPaidAt: row.lastPaidAt,
        dueDate: row.dueDate,
        amount: { amount: row.amount, currency: row.currency },
        joinedAt: member?.createdAt ?? null,
      };
    });
  return {
    data: rows,
    total:
      params.teamId === null ? outstandingSummary.studentCount : rows.length,
  };
}

/** Teams for the "All teams" filter. Real: `authClient.organization.listTeams`. */
export async function listDashboardTeams(
  academyId: Id
): Promise<{ id: Id; name: string }[]> {
  await fixtureDelay();
  return teams
    .filter((t) => t.academyId === academyId)
    .map(({ id, name }) => ({ id, name }));
}
