/*
 * The student's own attendance (ST-4). Mock-data convention: see features/viewer/api.ts.
 */
import { fixtureDelay } from "@/features/fixtures";
import { studentAttendance } from "@/features/student-attendance/fixtures";
import type {
  AttendanceRecord,
  DateOnly,
  Id,
  Paginated,
} from "@/features/types";

export interface AttendanceRange {
  from: DateOnly;
  to: DateOnly;
}

/**
 * GET /api/v1/me/attendance?academyId=&from=&to=
 * The caller's own rows in the range, oldest first. Voided rows are left out.
 */
export async function listMyAttendance(
  _academyId: Id,
  range: AttendanceRange
): Promise<Paginated<AttendanceRecord>> {
  await fixtureDelay();
  const data = studentAttendance
    .filter(
      (row) =>
        row.voidedAt === null &&
        row.sessionDate >= range.from &&
        row.sessionDate <= range.to
    )
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return { data, nextCursor: null };
}
