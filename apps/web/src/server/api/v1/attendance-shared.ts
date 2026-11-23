/**
 * Shared pieces of the attendance endpoints (./attendance.ts, ./scan.ts):
 * the injectable clock, the response shape, session windows and the
 * "may this member act on this row" checks.
 */
import type { Prisma, TransactionClient } from "@hoops-genesis/db/prisma";
import { ForbiddenError, NotFoundError } from "../errors";
import { loadPeople, type People, personRef, personWithImage } from "../people";
import type { AcademyMember } from "../roles";
import {
  canSeeStudent,
  type DbClient,
  isCoachOfStudent,
  isUserOnTeam,
} from "../scope";
import { toNullableTimestamp, toPlainDate, toTimeOfDay } from "../serialize";
import {
  addDays,
  type CheckInWindow,
  getCheckInWindow,
  zonedDateTimeToUtc,
} from "../time";

/**
 * The clock every attendance handler reads. Tests replace `now` with
 * `vi.spyOn(attendanceClock, "now")` so window checks never depend on the
 * real time.
 */
export const attendanceClock = {
  now: (): Date => new Date(),
};

export const ATTENDANCE_STATUSES = [
  "present",
  "absent",
  "late",
  "excused",
] as const;

export type AttendanceRow = Prisma.AttendanceModel;

/** The event columns the attendance checks need. */
export const sessionEventSelect = {
  id: true,
  academyId: true,
  teamId: true,
  startDate: true,
  endDate: true,
  excludedDates: true,
  startTime: true,
  endTime: true,
  collectAttendance: true,
} as const;

export type SessionEvent = Prisma.CalendarEventGetPayload<{
  select: typeof sessionEventSelect;
}>;

export type AttendanceWithEvent = AttendanceRow & { event: SessionEvent };

/**
 * Reads the event for an attendance write, holding a FOR SHARE lock on its
 * row until the transaction ends. The events endpoints (update, delete,
 * cancel a session) take FOR UPDATE and refuse changes once live attendance
 * exists, so a check-in can never land between their check and their commit.
 */
export const findEventForAttendanceWrite = async (
  tx: TransactionClient,
  academyId: string,
  eventId: string
): Promise<SessionEvent | null> => {
  const locked = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM calendar_event
    WHERE id = ${eventId} AND academy_id = ${academyId}
    FOR SHARE
  `;
  if (locked.length === 0) {
    return null;
  }
  return await tx.calendarEvent.findUnique({
    where: { id: eventId },
    select: sessionEventSelect,
  });
};

/**
 * An attendance row in its API form. Never carries coordinates. `people`
 * holds the student and the users named on the row (see
 * `serializeAttendanceRows`): `student` is `{ id, name, image }` for the
 * coach's session screen (CO-3), and every `...ById` has a `{ id, name }`
 * sibling (AO-6).
 */
export const serializeAttendance = (row: AttendanceRow, people: People) => ({
  id: row.id,
  academyId: row.academyId,
  eventId: row.eventId,
  sessionDate: toPlainDate(row.sessionDate),
  studentId: row.studentId,
  student: personWithImage(people, row.studentId),
  status: row.status,
  checkInAt: toNullableTimestamp(row.checkInAt),
  checkOutAt: toNullableTimestamp(row.checkOutAt),
  checkInDistanceM: row.checkInDistanceM,
  checkOutDistanceM: row.checkOutDistanceM,
  notes: row.notes,
  recordedById: row.recordedById,
  recordedBy: personRef(people, row.recordedById),
  verifiedAt: toNullableTimestamp(row.verifiedAt),
  verifiedById: row.verifiedById,
  verifiedBy: personRef(people, row.verifiedById),
  voidedAt: toNullableTimestamp(row.voidedAt),
  voidedById: row.voidedById,
  voidedBy: personRef(people, row.voidedById),
  voidReason: row.voidReason,
});

export type SerializedAttendance = ReturnType<typeof serializeAttendance>;

/** The users an attendance row names: student, recorder, verifier, voider. */
export const attendancePeopleIds = (
  rows: readonly AttendanceRow[]
): (string | null)[] =>
  rows.flatMap((row) => [
    row.studentId,
    row.recordedById,
    row.verifiedById,
    row.voidedById,
  ]);

/** Serializes rows with one user lookup for all of them (no N+1). */
export const serializeAttendanceRows = async (
  client: DbClient,
  rows: readonly AttendanceRow[]
): Promise<SerializedAttendance[]> => {
  const people = await loadPeople(client, attendancePeopleIds(rows));
  return rows.map((row) => serializeAttendance(row, people));
};

/** One row, serialized (see `serializeAttendanceRows`). */
export const serializeAttendanceRow = async (
  client: DbClient,
  row: AttendanceRow
): Promise<SerializedAttendance> => {
  const [serialized] = await serializeAttendanceRows(client, [row]);
  if (!serialized) {
    throw new Error("serializeAttendanceRows returned no row");
  }
  return serialized;
};

/**
 * The check-in/out window of one session. An event without times (all-day;
 * only possible if collect_attendance was turned off after recording) is open
 * for the whole local day.
 */
export const getSessionWindow = (
  event: Pick<SessionEvent, "startTime" | "endTime">,
  sessionDate: string,
  timeZone: string
): CheckInWindow => {
  if (event.startTime && event.endTime) {
    return getCheckInWindow({
      sessionDate,
      startTime: toTimeOfDay(event.startTime),
      endTime: toTimeOfDay(event.endTime),
      timeZone,
    });
  }
  return {
    opensAt: zonedDateTimeToUtc(sessionDate, "00:00", timeZone),
    closesAt: zonedDateTimeToUtc(addDays(sessionDate, 1), "00:00", timeZone),
  };
};

/**
 * May `member` record, check out, tick or untick attendance of `studentId`
 * at `event`? Academy admin: always. Coach: a team event of a team they are
 * on; for an academy-wide event, a student on one of their teams.
 */
export const canManageAttendance = async (
  client: DbClient,
  member: AcademyMember,
  event: Pick<SessionEvent, "teamId">,
  studentId: string
): Promise<boolean> => {
  if (member.isAdmin) {
    return true;
  }
  if (!member.isCoach) {
    return false;
  }
  if (event.teamId) {
    return await isUserOnTeam(
      client,
      member.academyId,
      member.userId,
      event.teamId
    );
  }
  return await isCoachOfStudent(
    client,
    member.academyId,
    member.userId,
    studentId
  );
};

/**
 * One attendance row of the academy that `member` may see (else 404), and
 * when `manage` is set, may also act on (else 403).
 */
export const findAttendanceInScope = async (
  client: DbClient,
  member: AcademyMember,
  id: string,
  options: { manage: boolean }
): Promise<AttendanceWithEvent> => {
  const row = await client.attendance.findFirst({
    where: { id, academyId: member.academyId },
    include: { event: { select: sessionEventSelect } },
  });
  if (!(row && (await canSeeStudent(client, member, row.studentId)))) {
    throw new NotFoundError("Attendance not found");
  }
  if (
    options.manage &&
    !(await canManageAttendance(client, member, row.event, row.studentId))
  ) {
    throw new ForbiddenError(
      "Only a coach of this team or an academy admin can do this"
    );
  }
  return row;
};
