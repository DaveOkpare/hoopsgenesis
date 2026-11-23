/* Pure helpers over a Session: groups, counts and labels. Safe to use in components. */
import type { Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";
import type { Session, SessionEntry } from "./api";
import { formatWeekdayDayMonth, localTime } from "./time";

export interface SessionGroups {
  /** No status yet but marked absent / excused by a coach. */
  absentOrExcused: SessionEntry[];
  checkedIn: SessionEntry[];
  checkedOut: SessionEntry[];
  notYet: SessionEntry[];
}

function isIn(entry: SessionEntry): boolean {
  const status = entry.attendance?.status;
  return status === "present" || status === "late";
}

function time(entry: SessionEntry): string {
  return entry.attendance?.checkInAt ?? "";
}

/**
 * Checked in: unticked first (latest first) so gaps stand out, then ticked (earliest first).
 * Not yet: roster order.
 */
export function groupSession(session: Session): SessionGroups {
  const checkedIn = session.roster.filter(
    (e) => isIn(e) && !e.attendance?.checkOutAt
  );
  const unticked = checkedIn
    .filter((e) => !e.attendance?.verifiedAt)
    .sort((a, b) => time(b).localeCompare(time(a)));
  const ticked = checkedIn
    .filter((e) => e.attendance?.verifiedAt)
    .sort((a, b) => time(a).localeCompare(time(b)));
  return {
    checkedIn: [...unticked, ...ticked],
    checkedOut: session.roster.filter(
      (e) => isIn(e) && e.attendance?.checkOutAt
    ),
    notYet: session.roster.filter((e) => !e.attendance),
    absentOrExcused: session.roster.filter(
      (e) =>
        e.attendance?.status === "absent" || e.attendance?.status === "excused"
    ),
  };
}

export interface SessionCounts {
  /** Checked in or out (present or late). */
  arrived: number;
  /** Absent rows written at close-out. */
  markedAbsent: number;
  /** On the roster with no row at all. */
  remaining: number;
  /** Arrived and ticked by anyone. */
  ticked: number;
  /** Arrived and ticked by this coach ("9 ticked by you"). */
  tickedByViewer: number;
  total: number;
  /** Arrived, not ticked yet. */
  unticked: number;
}

export function sessionCounts(session: Session, viewerId: Id): SessionCounts {
  const arrived = session.roster.filter(isIn);
  const ticked = arrived.filter((e) => e.attendance?.verifiedAt);
  return {
    total: session.roster.length,
    arrived: arrived.length,
    ticked: ticked.length,
    tickedByViewer: ticked.filter(
      (e) => e.attendance?.verifiedById === viewerId
    ).length,
    // Still here and not ticked; a checked-out student can no longer be ticked.
    unticked: arrived.filter(
      (e) => !(e.attendance?.verifiedAt || e.attendance?.checkOutAt)
    ).length,
    remaining: session.roster.filter((e) => !e.attendance).length,
    markedAbsent: session.roster.filter(
      (e) => e.attendance?.status === "absent"
    ).length,
  };
}

/**
 * "U12 · Morning skills". A title that already starts with the team name ("U14 training"
 * on U14) drops it and is capitalised, so it reads "U14 · Training", not "U14 · U14 training".
 */
export function sessionTitle(session: Session): string {
  const { title } = session.event;
  if (!session.team) {
    return title;
  }
  const teamName = session.team.name;
  const prefix = `${teamName.toLowerCase()} `;
  const rest = title.toLowerCase().startsWith(prefix)
    ? title.slice(prefix.length).trim()
    : title;
  const label = rest
    ? `${rest.charAt(0).toUpperCase()}${rest.slice(1)}`
    : title;
  return `${teamName} · ${label}`;
}

/** "07:00 – 08:30" */
export function sessionTimes(session: Session): string {
  const { startTime, endTime } = session.event;
  if (!startTime) {
    return "All day";
  }
  return endTime ? `${startTime} – ${endTime}` : startTime;
}

/** "U16 · Shooting clinic · Mon 23 Nov, 18:00 · Court 1" */
export function sessionLongLabel(session: Session): string {
  const parts = [
    sessionTitle(session),
    `${formatWeekdayDayMonth(session.sessionDate)}${
      session.event.startTime ? `, ${session.event.startTime}` : ""
    }`,
  ];
  if (session.event.location) {
    parts.push(session.event.location);
  }
  return parts.join(" · ");
}

export function opensAtLabel(session: Session): string {
  return localTime(new Date(session.opensAt), session.timeZone);
}

export function closesAtLabel(session: Session): string {
  return localTime(new Date(session.closesAt), session.timeZone);
}

/** "07:12 · 40 m away", "07:24 · late · by you". */
export function checkInDescription(
  entry: SessionEntry,
  session: Session,
  viewerId: Id
): string {
  const row = entry.attendance;
  if (!row?.checkInAt) {
    return "";
  }
  const at = localTime(new Date(row.checkInAt), session.timeZone);
  const parts = [at];
  if (row.status === "late") {
    parts.push("late");
  }
  if (row.checkInDistanceM !== null) {
    parts.push(`${row.checkInDistanceM} m away`);
  } else if (row.recordedById === viewerId) {
    parts.push("by you");
  } else {
    parts.push("by a coach");
  }
  return parts.join(" · ");
}

/** Photo stand-in tints, picked from the student id so a face keeps its colour. */
const TINT_CYCLE = ["#D9E8F2", "#F2E4D9", "#E0E8D9"] as const;

export function tintFor(studentId: Id): string {
  let hash = 0;
  for (const char of studentId) {
    hash = (hash + char.charCodeAt(0)) % TINT_CYCLE.length;
  }
  return TINT_CYCLE[hash] ?? TINT_CYCLE[0];
}

/** Weekday name for "Removes all 6 remaining Mondays". */
export function weekdayPlural(date: string): string {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));
  return `${weekday}s`;
}

const ERROR_COPY: Record<string, string> = {
  already_recorded: "Already recorded for this session. Refresh to see it.",
  attendance_exists:
    "Someone has already checked in to this session, so it can't be cancelled.",
  already_cancelled: "This session is already cancelled.",
  session_in_future: "This session hasn't started yet.",
  window_closed: "Check-in has closed, so this tick can't be undone.",
  already_voided: "This check-in was voided by an admin.",
  already_checked_out: "Already checked out.",
  not_checked_in: "There is no check-in to check out from.",
  student_not_on_team: "That student is no longer on this team.",
  attendance_not_collected: "This event doesn't take attendance.",
};

/** A toast line for a failed session action, by the server's error code. */
export function sessionErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return ERROR_COPY[error.code] ?? errorMessage(error);
  }
  return errorMessage(error);
}
