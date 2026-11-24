import { queryOptions } from "@tanstack/react-query";

import {
  type AttendanceRange,
  listMyAttendance,
  listSessionDays,
} from "@/features/student-attendance/api";
import type { Id } from "@/features/types";

export type {
  AttendanceRange,
  MyAttendance,
  NameRef,
} from "@/features/student-attendance/api";

export const myAttendanceKeys = {
  all: (academyId: Id) => ["academies", academyId, "me", "attendance"] as const,
  range: (academyId: Id, range: AttendanceRange) =>
    [...myAttendanceKeys.all(academyId), range] as const,
};

/** Team session days in the range (which days link to a session, which are upcoming). */
export function sessionDaysQueryOptions(academyId: Id, range: AttendanceRange) {
  return queryOptions({
    queryKey: ["academies", academyId, "me", "session-days", range] as const,
    queryFn: () => listSessionDays(academyId, range),
  });
}

export function myAttendanceQueryOptions(
  academyId: Id,
  range: AttendanceRange
) {
  return queryOptions({
    queryKey: myAttendanceKeys.range(academyId, range),
    queryFn: () => listMyAttendance(academyId, range),
    select: (page) => page.data,
  });
}
