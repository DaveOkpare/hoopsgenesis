/* Pure helpers shared by the real and preview implementations. */
import type { AttendanceStatus } from "@/features/types";

export interface AttendanceCounts {
  absent: number;
  excused: number;
  late: number;
  present: number;
  /** (present + late) / (present + late + absent); null with no counted session. */
  rate: number | null;
}

/** Counts per status and the attendance rate, as GET /dashboard computes it. */
export function countAttendance(
  sessions: { status: AttendanceStatus }[]
): AttendanceCounts {
  const count = (status: AttendanceStatus) =>
    sessions.filter((s) => s.status === status).length;
  const present = count("present");
  const late = count("late");
  const absent = count("absent");
  const counted = present + late + absent;
  return {
    present,
    late,
    absent,
    excused: count("excused"),
    rate: counted === 0 ? null : (present + late) / counted,
  };
}
