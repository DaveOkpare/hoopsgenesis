/*
 * Preview-mode (fixture) implementation of features/student-attendance/api.ts. Dev only.
 */
import { fixtureDelay, users } from "@/features/fixtures";
import type {
  AttendanceRange,
  MyAttendance,
  NameRef,
} from "@/features/student-attendance/api";
import { studentAttendance } from "@/features/student-attendance/fixtures";
import type { AttendanceRecord, Id, Paginated } from "@/features/types";

function nameRef(id: Id | null): NameRef | null {
  const found = users.find((u) => u.id === id);
  return found ? { id: found.id, name: found.name } : null;
}

/** A fixture row in the server's shape (`...ById` plus `{ id, name }`). */
export function toMyAttendance(row: AttendanceRecord): MyAttendance {
  return {
    academyId: row.academyId,
    checkInAt: row.checkInAt,
    checkInDistanceM: row.checkInDistanceM,
    checkOutAt: row.checkOutAt,
    checkOutDistanceM: row.checkOutDistanceM,
    eventId: row.eventId,
    id: row.id,
    notes: row.notes,
    recordedById: row.recordedBy,
    recordedBy: nameRef(row.recordedBy),
    sessionDate: row.sessionDate,
    status: row.status,
    studentId: row.studentId,
    verifiedAt: row.verifiedAt,
    verifiedById: row.verifiedBy,
    verifiedBy: nameRef(row.verifiedBy),
  };
}

/** The caller's own rows in the range, oldest first. Voided rows are left out. */
export async function listMyAttendance(
  _academyId: Id,
  range: AttendanceRange
): Promise<Paginated<MyAttendance>> {
  await fixtureDelay();
  const data = studentAttendance
    .filter(
      (row) =>
        row.voidedAt === null &&
        row.sessionDate >= range.from &&
        row.sessionDate <= range.to
    )
    .sort((a, b) => a.sessionDate.localeCompare(b.sessionDate))
    .map(toMyAttendance);
  return { data, nextCursor: null };
}
