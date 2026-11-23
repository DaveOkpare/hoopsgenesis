/*
 * Fixture calendar and attendance for the coach screens. Only api.ts files import this.
 *
 * Attendance rows carry real timestamps, and the api returns them "as of" the session
 * clock (see clock.ts), so one data set draws both designs of the U12 session:
 *   07:24 (default preview clock) -> 3O4-0 Live check-ins: 11 of 16 in, 9 ticked.
 *   10:02 (?at=10:02)             -> 5IC-0 Close out: 14 of 16 in, 12 ticked, 2 never came.
 * Mutable on purpose: api.ts mutations push and update rows.
 */
import { events as sharedEvents } from "@/features/fixtures";
import type { AttendanceRecord, CalendarEvent } from "@/features/types";

const CREATED = "2026-03-01T08:00:00Z";

function weeklyCopies(
  source: CalendarEvent,
  dates: string[],
  idPrefix: string
): CalendarEvent[] {
  return dates.map((startDate) => ({
    ...source,
    id: `${idPrefix}-${startDate}`,
    startDate,
    createdAt: CREATED,
    updatedAt: CREATED,
  }));
}

const u16Clinic = sharedEvents.find((e) => e.id === "event-u16-shooting");

/** Shared events plus the rest of the U16 Monday series ("6 remaining Mondays"). */
export const calendarEvents: CalendarEvent[] = [
  ...sharedEvents.map((e) => ({ ...e, excludedDates: [...e.excludedDates] })),
  ...(u16Clinic
    ? weeklyCopies(
        u16Clinic,
        ["2026-11-30", "2026-12-07", "2026-12-14", "2026-12-21", "2026-12-28"],
        "event-u16-shooting"
      )
    : []),
];

const SESSION_DATE = "2026-11-23";
const U12_EVENT = "event-u12-morning";

function row(
  studentId: string,
  checkInAt: string,
  distanceM: number,
  verifiedAt: string | null
): AttendanceRecord {
  return {
    id: `att-${U12_EVENT}-${studentId}`,
    academyId: "acad-kigali",
    eventId: U12_EVENT,
    sessionDate: SESSION_DATE,
    studentId,
    status: "present",
    checkInAt,
    checkInDistanceM: distanceM,
    checkOutAt: null,
    checkOutDistanceM: null,
    recordedBy: studentId,
    verifiedAt,
    verifiedBy: verifiedAt ? "user-sharika" : null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    notes: null,
  };
}

const FIRST_TICKS = "2026-11-23T05:15:00Z";
const LATE_TICKS = "2026-11-23T05:50:00Z";

/** U12 Morning skills, Mon 23 Nov (Kigali is UTC+2: 04:51Z = 06:51). */
export const attendanceRows: AttendanceRecord[] = [
  row("user-keza", "2026-11-23T04:51:00Z", 22, FIRST_TICKS),
  row("user-mercy", "2026-11-23T04:52:00Z", 31, FIRST_TICKS),
  row("user-fabrice-m", "2026-11-23T04:54:00Z", 18, FIRST_TICKS),
  row("user-yvonne-u", "2026-11-23T04:56:00Z", 46, FIRST_TICKS),
  row("user-claude-h", "2026-11-23T04:58:00Z", 27, FIRST_TICKS),
  row("user-josiane-i", "2026-11-23T05:01:00Z", 35, FIRST_TICKS),
  row("user-david-n", "2026-11-23T05:03:00Z", 52, FIRST_TICKS),
  row("user-alice-m", "2026-11-23T05:05:00Z", 19, FIRST_TICKS),
  row("user-moise-h", "2026-11-23T05:07:00Z", 64, FIRST_TICKS),
  row("user-olivia", "2026-11-23T05:09:00Z", 85, null),
  row("user-divine-i", "2026-11-23T05:12:00Z", 40, null),
  // Arrive after 07:24, ticked at 07:50.
  row("user-clarisse-u", "2026-11-23T05:31:00Z", 24, LATE_TICKS),
  row("user-ivan-g", "2026-11-23T05:38:00Z", 58, LATE_TICKS),
  row("user-nadia-u", "2026-11-23T05:45:00Z", 33, LATE_TICKS),
];

/** Photo stand-ins: the tinted circles from 3O4-0. */
export const avatarTints: Record<string, string> = {
  "user-divine-i": "#D9E8F2",
  "user-olivia": "#F2E4D9",
  "user-keza": "#E0E8D9",
};

export const TINT_CYCLE = ["#D9E8F2", "#F2E4D9", "#E0E8D9"] as const;
