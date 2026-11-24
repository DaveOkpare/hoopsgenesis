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
import { academyMembers } from "@/features/team-detail/fixtures";
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

/** A row for the session detail designs (GN5-0 closed out, GFQ-0 not closed). */
function designRow(
  eventId: string,
  sessionDate: string,
  studentId: string,
  fields: Partial<AttendanceRecord>
): AttendanceRecord {
  return {
    id: `att-${eventId}-${studentId}`,
    academyId: "acad-kigali",
    eventId,
    sessionDate,
    studentId,
    status: "present",
    checkInAt: null,
    checkInDistanceM: null,
    checkOutAt: null,
    checkOutDistanceM: null,
    recordedBy: studentId,
    verifiedAt: null,
    verifiedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
    notes: null,
    ...fields,
  };
}

const U14_WED = "event-u14-mw-2026-11-18";
const U16_SAT = "event-u16-sat-2026-11-21";

/** U14 Wed 18 Nov, closed out by Coach Patrick (GN5-0). */
const u14Closed: AttendanceRecord[] = [
  designRow(U14_WED, "2026-11-18", "user-kevin", {
    status: "absent",
    recordedBy: "user-patrick",
  }),
  designRow(U14_WED, "2026-11-18", "user-jean", {
    status: "late",
    checkInAt: "2026-11-18T13:48:00Z",
    checkInDistanceM: 30,
    verifiedAt: "2026-11-18T13:50:00Z",
    verifiedBy: "user-patrick",
  }),
  designRow(U14_WED, "2026-11-18", "user-aline", {
    status: "excused",
    recordedBy: "user-patrick",
    notes: "told the coach ahead",
  }),
  designRow(U14_WED, "2026-11-18", "user-olivier", {
    checkInAt: "2026-11-18T13:31:00Z",
    recordedBy: "user-sharika",
    verifiedAt: "2026-11-18T13:31:00Z",
    verifiedBy: "user-sharika",
  }),
  designRow(U14_WED, "2026-11-18", "user-divine-n", {
    checkInAt: "2026-11-18T13:26:00Z",
    checkInDistanceM: 22,
    checkOutAt: "2026-11-18T15:02:00Z",
    checkOutDistanceM: 31,
    verifiedAt: "2026-11-18T13:40:00Z",
    verifiedBy: "user-patrick",
  }),
];

/** U16 Sat 21 Nov, ended but not closed out (GFQ-0): Samuel Mugabo never marked. */
const u16Open: AttendanceRecord[] = [
  designRow(U16_SAT, "2026-11-21", "user-samuel-i", {
    status: "late",
    checkInAt: "2026-11-21T07:14:00Z",
    checkInDistanceM: 40,
    checkOutAt: "2026-11-21T08:30:00Z",
    checkOutDistanceM: 35,
  }),
];

const MS_PER_MINUTE = 60_000;

function studentsOf(teamId: string): string[] {
  return academyMembers
    .filter((m) => m.roles.includes("student") && m.teamIds.includes(teamId))
    .map((m) => m.userId);
}

/** Everyone else on U14 came on 18 Nov (scanned, ticked), so the session is closed out. */
const u14Rest = studentsOf("team-u14")
  .filter((id) => !u14Closed.some((r) => r.studentId === id))
  .map((id, index) =>
    designRow(U14_WED, "2026-11-18", id, {
      checkInAt: new Date(
        Date.parse("2026-11-18T13:20:00Z") + index * MS_PER_MINUTE
      ).toISOString(),
      checkInDistanceM: 20 + index,
      verifiedAt: "2026-11-18T13:45:00Z",
      verifiedBy: "user-patrick",
    })
  );

/** U16 on 21 Nov: all but four came (scanned in and out). */
const U16_NEVER_MARKED = 4;
const u16Others = studentsOf("team-u16").filter(
  (id) => !u16Open.some((r) => r.studentId === id)
);
const u16Rest = u16Others
  .slice(0, Math.max(0, u16Others.length - U16_NEVER_MARKED))
  .map((id, index) =>
    designRow(U16_SAT, "2026-11-21", id, {
      status: index === 0 ? "late" : "present",
      checkInAt: new Date(
        Date.parse("2026-11-21T06:52:00Z") + index * 2 * MS_PER_MINUTE
      ).toISOString(),
      checkInDistanceM: 25 + index,
      checkOutAt: index % 3 === 0 ? null : "2026-11-21T08:31:00Z",
      checkOutDistanceM: index % 3 === 0 ? null : 30,
      verifiedAt: index % 3 === 0 ? "2026-11-21T07:10:00Z" : null,
      verifiedBy: index % 3 === 0 ? "user-patrick" : null,
    })
  );

/**
 * 91C-0 live session, U14 Mon 23 Nov 16:00 (?at=16:05): five scanned, one checked in by
 * hand; the times are 15:42 to 16:04 Kigali.
 */
const U14_LIVE = "event-u14-training";
const LIVE_TIMES = ["13:42", "13:47", "13:49", "13:51", "14:03"];
const u14Live = studentsOf("team-u14")
  .slice(0, LIVE_TIMES.length)
  .map((id, index) =>
    designRow(U14_LIVE, SESSION_DATE, id, {
      status: index === LIVE_TIMES.length - 1 ? "late" : "present",
      checkInAt: `${SESSION_DATE}T${LIVE_TIMES[index]}:00Z`,
      checkInDistanceM: 30 + index,
    })
  );
const handLive = studentsOf("team-u14")[LIVE_TIMES.length];
if (handLive) {
  u14Live.push(
    designRow(U14_LIVE, SESSION_DATE, handLive, {
      status: "late",
      checkInAt: `${SESSION_DATE}T14:04:00Z`,
      recordedBy: "user-sharika",
      verifiedAt: `${SESSION_DATE}T14:04:00Z`,
      verifiedBy: "user-sharika",
    })
  );
}

attendanceRows.push(
  ...u14Closed,
  ...u14Rest,
  ...u16Open,
  ...u16Rest,
  ...u14Live
);

/** Photo stand-ins: the tinted circles from 3O4-0. */
export const avatarTints: Record<string, string> = {
  "user-divine-i": "#D9E8F2",
  "user-olivia": "#F2E4D9",
  "user-keza": "#E0E8D9",
};

export const TINT_CYCLE = ["#D9E8F2", "#F2E4D9", "#E0E8D9"] as const;
