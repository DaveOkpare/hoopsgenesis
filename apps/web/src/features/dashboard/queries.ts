import { queryOptions } from "@tanstack/react-query";

import {
  getDashboard,
  listDashboardTeams,
  listTodaySessions,
  listUnpaidStudents,
  referenceNow,
} from "@/features/dashboard/api";
import type { DateOnly, Id } from "@/features/types";

export type {
  DashboardSummary,
  TodaySession,
  UnpaidStudent,
} from "@/features/dashboard/api";

export const dashboardKeys = {
  summary: (academyId: Id) => ["academies", academyId, "dashboard"] as const,
  sessions: (academyId: Id, date: DateOnly) =>
    ["academies", academyId, "dashboard", "sessions", date] as const,
  unpaid: (academyId: Id, teamId: Id | null) =>
    ["academies", academyId, "dashboard", "unpaid", teamId] as const,
  teams: (academyId: Id) =>
    ["academies", academyId, "dashboard", "teams"] as const,
};

/** "Now" for the dashboard (the fixture clock until the API is real). */
export function useDashboardNow(): Date {
  return referenceNow();
}

export function dashboardQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: dashboardKeys.summary(academyId),
    queryFn: () => getDashboard(academyId),
  });
}

export function todaySessionsQueryOptions(academyId: Id, date: DateOnly) {
  return queryOptions({
    queryKey: dashboardKeys.sessions(academyId, date),
    queryFn: () => listTodaySessions(academyId, date),
  });
}

export function unpaidStudentsQueryOptions(academyId: Id, teamId: Id | null) {
  return queryOptions({
    queryKey: dashboardKeys.unpaid(academyId, teamId),
    queryFn: () => listUnpaidStudents(academyId, { teamId }),
  });
}

export function dashboardTeamsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: dashboardKeys.teams(academyId),
    queryFn: () => listDashboardTeams(academyId),
  });
}
