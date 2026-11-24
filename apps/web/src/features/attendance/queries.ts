/*
 * Query layer for the attendance screens. Keys sit under ["academies", id,
 * "attendance"], which the session screens invalidate after every attendance write.
 */
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

import {
  type AttendanceRanges,
  getAcademyAttendance,
  getTeamAttendance,
} from "@/features/attendance/api";
import type { Id, Timestamp } from "@/features/types";

export type {
  AcademyAttendance,
  AttendanceRanges,
  DateRange,
  SessionSummary,
  StatusCounts,
  StudentAttendance,
  TeamAttendance,
  TeamRate,
} from "@/features/attendance/api";

export function academyAttendanceQueryOptions(
  academyId: Id,
  params: AttendanceRanges & { teamId?: Id; now: Timestamp }
) {
  return queryOptions({
    queryKey: [
      "academies",
      academyId,
      "attendance",
      "overview",
      params,
    ] as const,
    queryFn: () => getAcademyAttendance(academyId, params),
    placeholderData: keepPreviousData,
  });
}

export function teamAttendanceQueryOptions(
  academyId: Id,
  teamId: Id,
  params: AttendanceRanges & { now: Timestamp }
) {
  return queryOptions({
    queryKey: [
      "academies",
      academyId,
      "attendance",
      "team",
      teamId,
      params,
    ] as const,
    queryFn: () => getTeamAttendance(academyId, teamId, params),
    placeholderData: keepPreviousData,
    enabled: teamId !== "",
  });
}
