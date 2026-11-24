/*
 * The student's own attendance (ST-4). Data-layer convention: see features/viewer/api.ts.
 */
import { listEventOccurrences } from "@/features/student-calendar/api";
import type {
  AttendanceStatus,
  DateOnly,
  Id,
  Paginated,
  Timestamp,
} from "@/features/types";
import { apiAll } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

export interface AttendanceRange {
  from: DateOnly;
  to: DateOnly;
}

/** `{ id, name }` the server puts next to each `...ById`. */
export interface NameRef {
  id: Id;
  name: string;
}

/** One row of GET /api/v1/me/attendance (the server's attendance shape). */
export interface MyAttendance {
  academyId: Id;
  checkInAt: Timestamp | null;
  checkInDistanceM: number | null;
  checkOutAt: Timestamp | null;
  checkOutDistanceM: number | null;
  eventId: Id;
  id: Id;
  notes: string | null;
  recordedBy: NameRef | null;
  recordedById: Id;
  sessionDate: DateOnly;
  status: AttendanceStatus;
  studentId: Id;
  verifiedAt: Timestamp | null;
  verifiedBy: NameRef | null;
  verifiedById: Id | null;
}

/**
 * GET /api/v1/me/attendance?academyId=&from=&to=
 * The caller's own rows in the range (voided rows are left out by the server), oldest
 * first.
 */
export async function listMyAttendance(
  academyId: Id,
  range: AttendanceRange
): Promise<Paginated<MyAttendance>> {
  if (mock) {
    return (await mock()).listMyAttendance(academyId, range);
  }
  const rows = await apiAll<MyAttendance>("/me/attendance", {
    query: { academyId, from: range.from, to: range.to },
  });
  const data = [...rows].sort((a, b) =>
    a.sessionDate.localeCompare(b.sessionDate)
  );
  return { data, nextCursor: null };
}

/** A team session day, for the attendance calendar's links and upcoming dots. */
export interface SessionDay {
  cancelled: boolean;
  eventId: Id;
  sessionDate: DateOnly;
}

/**
 * Every team session day in the range (GET /events, one row per session day, through
 * the calendar feature's call, which also serves the preview fixtures). Academy-wide
 * events are left out, as in 46Z-0 (team training and matches only).
 */
export async function listSessionDays(
  academyId: Id,
  range: AttendanceRange
): Promise<SessionDay[]> {
  const occurrences = await listEventOccurrences(academyId, range);
  return occurrences
    .filter(({ event }) => event.teamId !== null)
    .map(({ event, sessionDate, cancelled }) => ({
      eventId: event.id,
      sessionDate,
      cancelled,
    }));
}
