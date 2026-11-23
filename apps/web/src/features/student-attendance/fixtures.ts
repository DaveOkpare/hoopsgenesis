/*
 * Aline's attendance rows, one per U14 session she was expected at. November matches
 * "[Student] My attendance" (46Z-0): late on 7 Nov, absent on 11 Nov, excused on 18 Nov,
 * checked in (not yet ticked) today; every other session present and coach-confirmed.
 * Only student-attendance/api.ts imports this file.
 */
import { studentCalendarEvents } from "@/features/student-calendar/fixtures";
import type {
  AttendanceRecord,
  AttendanceStatus,
  DateOnly,
} from "@/features/types";

const STUDENT_ID = "user-aline";
const COACH_ID = "user-patrick";
const TODAY = "2026-11-23";

const EXCEPTIONS: Record<DateOnly, AttendanceStatus> = {
  "2026-09-19": "late",
  "2026-10-14": "absent",
  "2026-10-24": "excused",
  "2026-11-07": "late",
  "2026-11-11": "absent",
  "2026-11-18": "excused",
};

/** Kigali is UTC+2: "16:00" local is "14:00Z". */
function utcAt(date: DateOnly, localTime: string, minutesLate = 0): string {
  const [hours = 0, minutes = 0] = localTime.split(":").map(Number);
  const KIGALI_OFFSET_HOURS = 2;
  const total = (hours - KIGALI_OFFSET_HOURS) * 60 + minutes + minutesLate;
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${date}T${hh}:${mm}:00Z`;
}

const EARLY_MINUTES = -18;
const LATE_MINUTES = 12;
const TICK_AFTER_MINUTES = 5;
const CHECK_OUT_AFTER_MINUTES = 92;

function row(
  eventId: string,
  date: DateOnly,
  startTime: string,
  status: AttendanceStatus
): AttendanceRecord {
  const attended = status === "present" || status === "late";
  const isToday = date === TODAY;
  /** The coach ticks students they saw; today's tick hasn't happened yet. */
  const confirmed = attended && !isToday;
  const checkInAt = attended
    ? utcAt(date, startTime, status === "late" ? LATE_MINUTES : EARLY_MINUTES)
    : null;
  return {
    id: `attendance-aline-${date}`,
    academyId: "acad-kigali",
    eventId,
    studentId: STUDENT_ID,
    sessionDate: date,
    status,
    checkInAt,
    checkInDistanceM: attended ? 38 : null,
    checkOutAt:
      attended && !isToday
        ? utcAt(date, startTime, CHECK_OUT_AFTER_MINUTES)
        : null,
    checkOutDistanceM: attended && !isToday ? 41 : null,
    notes: status === "excused" ? "School trip" : null,
    recordedBy: attended ? STUDENT_ID : COACH_ID,
    verifiedAt: confirmed ? utcAt(date, startTime, TICK_AFTER_MINUTES) : null,
    verifiedBy: confirmed ? COACH_ID : null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

export const studentAttendance: AttendanceRecord[] = studentCalendarEvents
  .filter(
    (event) =>
      event.teamId !== null &&
      event.collectAttendance &&
      event.startDate <= TODAY &&
      !event.excludedDates.includes(event.startDate)
  )
  .map((event) =>
    row(
      event.id,
      event.startDate,
      event.startTime ?? "16:00",
      EXCEPTIONS[event.startDate] ?? "present"
    )
  );
