/*
 * Preview-mode (fixture) implementation of features/dashboard/api.ts. Dev only.
 * It reads the shared fixtures directly instead of importing other features.
 */

import type {
  DashboardSummary,
  TodaySession,
  UnpaidPage,
  UnpaidStudent,
} from "@/features/dashboard/api";
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
  fixtureDelay,
  members,
  outstandingFees,
  studentRecords,
  teams,
  users,
} from "@/features/fixtures";
import type { DateOnly, Id } from "@/features/types";

function teamName(teamId: Id | null): string | null {
  return teams.find((t) => t.id === teamId)?.name ?? null;
}

function userName(userId: Id): string {
  return users.find((u) => u.id === userId)?.name ?? "Unknown";
}

function recordLabel(record: (typeof studentRecords)[number]): string {
  if (record.data.kind === "report_card") {
    return "report card";
  }
  return record.recordType === "academic" ? "academic record" : "result";
}

const DAY_MS = 86_400_000;
const DAYS_PER_WEEK = 7;
/** Monday of the designs' week (FIXTURE_NOW is Mon 23 Nov 2026). */
const FIXTURE_MONDAY = Date.UTC(2026, 10, 23);

function fixtureWeekStart(weeksAgo: number): DateOnly {
  return new Date(FIXTURE_MONDAY - weeksAgo * DAYS_PER_WEEK * DAY_MS)
    .toISOString()
    .slice(0, "YYYY-MM-DD".length);
}

/** Real: `GET /api/v1/academies/:academyId/dashboard`. */
export async function getDashboard(academyId: Id): Promise<DashboardSummary> {
  await fixtureDelay();
  const weekly = weeklyAttendancePercent.map((percent, index, all) => ({
    weekStart: fixtureWeekStart(all.length - 1 - index),
    percent,
  }));
  const thisWeek = weekly.at(-1)?.percent ?? 0;
  const lastWeek = weekly.at(-2)?.percent ?? thisWeek;
  const oldest = studentRecords.find(
    (r) =>
      r.academyId === academyId && r.id === pendingRecordsSummary.oldestRecordId
  );
  const topTeam = teamName(outstandingSummary.topTeam.teamId);
  return {
    attendance: {
      thisWeekPercent: thisWeek,
      changePts: thisWeek - lastWeek,
      weekly,
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
