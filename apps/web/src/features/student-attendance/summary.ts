/*
 * Month attendance numbers (ST-4): the rate counts present and late as attended and
 * leaves excused sessions out; the streak counts back from the latest session, skipping
 * excused ones.
 */
import type { MyAttendance } from "@/features/student-attendance/queries";
import type { AttendanceStatus, Id } from "@/features/types";

export interface AttendanceSummary {
  attended: number;
  /** Sessions that count (excused left out). */
  counted: number;
  /** Counted sessions in date order, keyed by the attendance row's id. */
  marks: { id: Id; attended: boolean }[];
  /** 0–100, rounded; null with no counted sessions. */
  rate: number | null;
  streak: number;
}

const PERCENT = 100;

export function isAttended(status: AttendanceStatus): boolean {
  return status === "present" || status === "late";
}

export function summarizeAttendance(rows: MyAttendance[]): AttendanceSummary {
  const counted = [...rows]
    .filter((row) => row.status !== "excused")
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const marks = counted.map((row) => ({
    id: row.id,
    attended: isAttended(row.status),
  }));
  const attended = marks.filter((mark) => mark.attended).length;
  let streak = 0;
  for (const mark of [...marks].reverse()) {
    if (!mark.attended) {
      break;
    }
    streak += 1;
  }
  return {
    attended,
    counted: counted.length,
    marks,
    rate:
      counted.length > 0
        ? Math.round((attended / counted.length) * PERCENT)
        : null,
    streak,
  };
}
