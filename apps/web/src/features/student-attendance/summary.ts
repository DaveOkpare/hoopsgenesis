/*
 * Month attendance numbers (ST-4): the rate counts present and late as attended and
 * leaves excused sessions out; the streak counts back from the latest session, skipping
 * excused ones.
 */
import type { AttendanceRecord, AttendanceStatus } from "@/features/types";

export interface AttendanceSummary {
  attended: number;
  /** Sessions that count (excused left out). */
  counted: number;
  /** Counted sessions in date order: true = attended. */
  marks: boolean[];
  /** 0–100, rounded; null with no counted sessions. */
  rate: number | null;
  streak: number;
}

const PERCENT = 100;

export function isAttended(status: AttendanceStatus): boolean {
  return status === "present" || status === "late";
}

export function summarizeAttendance(
  rows: AttendanceRecord[]
): AttendanceSummary {
  const counted = [...rows]
    .filter((row) => row.status !== "excused")
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  const marks = counted.map((row) => isAttended(row.status));
  const attended = marks.filter(Boolean).length;
  let streak = 0;
  for (const mark of [...marks].reverse()) {
    if (!mark) {
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
