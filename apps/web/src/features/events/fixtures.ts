/*
 * Fixture events for the event and session detail designs. Only api.mock.ts files import
 * this. "Today" is Mon 23 Nov 2026.
 *   DZQ-0 / HLF-0 / F26-0 / HWK-0 / G4Z-0 / FFE-0 / FHQ-0: U14 Training, Mon and Wed
 *     15:30 to 17:00 at Main court, weekly 11 Nov to 16 Dec, 30 Nov cancelled.
 *   EI2-0: December camp, 14 to 16 Dec, whole academy.
 *   I86-0: a Saturday U14 Training on 7 Nov (09:00 to 10:30) that Aline was late for.
 * Mutable on purpose: the mock's edits, cancels and deletes change these rows.
 */
import type { CalendarEvent, DateOnly } from "@/features/types";

const ACADEMY = "acad-kigali";

export const U14_SERIES_PREFIX = "event-u14-mw";

const U14_DATES: DateOnly[] = [
  "2026-11-11",
  "2026-11-16",
  "2026-11-18",
  "2026-11-23",
  "2026-11-25",
  "2026-11-30",
  "2026-12-02",
  "2026-12-07",
  "2026-12-09",
  "2026-12-14",
  "2026-12-16",
];

function u14(date: DateOnly): CalendarEvent {
  return {
    id: `${U14_SERIES_PREFIX}-${date}`,
    academyId: ACADEMY,
    teamId: "team-u14",
    eventType: "training",
    title: "U14 Training",
    description: null,
    location: "Main court",
    startDate: date,
    endDate: null,
    startTime: "15:30",
    endTime: "17:00",
    excludedDates: date === "2026-11-30" ? [date] : [],
    collectAttendance: true,
    createdBy: "user-patrick",
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T09:00:00Z",
  };
}

export const detailEvents: CalendarEvent[] = [
  ...U14_DATES.map(u14),
  {
    id: "event-december-camp",
    academyId: ACADEMY,
    teamId: null,
    eventType: "camp",
    title: "December camp",
    description: null,
    location: "Main court and gym",
    startDate: "2026-12-14",
    endDate: "2026-12-16",
    startTime: "09:00",
    endTime: "15:00",
    excludedDates: [],
    collectAttendance: true,
    createdBy: "user-sharika",
    createdAt: "2026-11-09T09:00:00Z",
    updatedAt: "2026-11-09T09:00:00Z",
  },
  {
    // GFQ-0 / HRK-0: ended, not closed out.
    id: "event-u16-sat-2026-11-21",
    academyId: ACADEMY,
    teamId: "team-u16",
    eventType: "training",
    title: "U16 Training",
    description: null,
    location: "Main court",
    startDate: "2026-11-21",
    endDate: null,
    startTime: "09:00",
    endTime: "10:30",
    excludedDates: [],
    collectAttendance: true,
    createdBy: "user-patrick",
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T09:00:00Z",
  },
  {
    id: "event-u14-sat-2026-11-07",
    academyId: ACADEMY,
    teamId: "team-u14",
    eventType: "training",
    title: "U14 Training",
    description: null,
    location: "Main court",
    startDate: "2026-11-07",
    endDate: null,
    startTime: "09:00",
    endTime: "10:30",
    excludedDates: [],
    collectAttendance: true,
    createdBy: "user-patrick",
    createdAt: "2026-09-02T09:00:00Z",
    updatedAt: "2026-09-02T09:00:00Z",
  },
];

/** Past-session counts in DZQ-0 ("eventId:date"). */
export const detailTallies: Record<
  string,
  {
    present: number;
    late: number;
    absent: number;
    excused: number;
    notMarked: number;
  }
> = {
  [`${U14_SERIES_PREFIX}-2026-11-18:2026-11-18`]: {
    present: 15,
    late: 2,
    absent: 1,
    excused: 0,
    notMarked: 0,
  },
  [`${U14_SERIES_PREFIX}-2026-11-16:2026-11-16`]: {
    present: 16,
    late: 0,
    absent: 2,
    excused: 0,
    notMarked: 0,
  },
  [`${U14_SERIES_PREFIX}-2026-11-11:2026-11-11`]: {
    present: 13,
    late: 1,
    absent: 0,
    excused: 0,
    notMarked: 4,
  },
};

/** Who cancelled 30 Nov and why (the activity log row admins can read). */
export const detailCancelNotes: Record<string, { by: string; reason: string }> =
  {
    [`${U14_SERIES_PREFIX}-2026-11-30:2026-11-30`]: {
      by: "Coach Patrick",
      reason: "court closed for repairs",
    },
  };

/** Coaches and student counts of the fixture teams, as GET /teams and rosters give them. */
export const detailTeams: Record<
  string,
  {
    name: string;
    studentCount: number;
    coaches: { id: string; name: string }[];
  }
> = {
  "team-u12": {
    name: "U12",
    studentCount: 16,
    coaches: [{ id: "user-sharika", name: "Sharika D." }],
  },
  "team-u14": {
    name: "U14",
    studentCount: 18,
    coaches: [
      { id: "user-patrick", name: "Patrick Habimana" },
      { id: "user-sharika", name: "Sharika D." },
    ],
  },
  "team-u16": {
    name: "U16",
    studentCount: 15,
    coaches: [{ id: "user-sharika", name: "Sharika D." }],
  },
  "team-girls-u16": {
    name: "Girls U16",
    studentCount: 12,
    coaches: [{ id: "user-grace-a", name: "Grace A." }],
  },
};

/** Aline's own rows for the student session designs (I69-0, I86-0). */
export const alineRows = [
  {
    eventId: `${U14_SERIES_PREFIX}-2026-11-16`,
    sessionDate: "2026-11-16",
    id: "att-aline-2026-11-16",
    status: "present" as const,
    checkInAt: "2026-11-16T13:24:00Z",
    checkInDistanceM: 32,
    checkOutAt: "2026-11-16T15:02:00Z",
    checkOutDistanceM: 40,
    notes: null,
    recordedById: "user-aline",
    recordedBy: { id: "user-aline", name: "Aline Uwase" },
    studentId: "user-aline",
    verifiedAt: "2026-11-16T13:40:00Z",
    verifiedBy: { id: "user-patrick", name: "Patrick Habimana" },
  },
  {
    eventId: "event-u14-sat-2026-11-07",
    sessionDate: "2026-11-07",
    id: "att-aline-2026-11-07",
    status: "late" as const,
    checkInAt: "2026-11-07T07:12:00Z",
    checkInDistanceM: 28,
    checkOutAt: "2026-11-07T08:31:00Z",
    checkOutDistanceM: 35,
    notes: null,
    recordedById: "user-aline",
    recordedBy: { id: "user-aline", name: "Aline Uwase" },
    studentId: "user-aline",
    verifiedAt: "2026-11-07T07:20:00Z",
    verifiedBy: { id: "user-patrick", name: "Patrick Habimana" },
  },
];
