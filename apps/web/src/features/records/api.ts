/*
 * Records review queue (CO-9), coach and admin side. Mock implementations of
 * `GET /records`, `POST /records/:id/verify` and `POST /records/:id/reject` (see the
 * convention notes in features/viewer/api.ts). The student upload side lives in
 * features/student-records.
 */
import { appendAuditEntry, mockNow } from "@/features/audit-log/api";
import {
  fixtureDelay,
  members,
  studentRecords,
  teams,
  users,
} from "@/features/fixtures";
import type { Id, RecordStatus, StudentRecord } from "@/features/types";

/**
 * Who is asking. The real server scopes by the session: admins see the whole academy;
 * coaches see their teams' students and never their own entries. The mock needs it spelled out.
 */
export type ReviewScope =
  | { kind: "admin"; viewerId: Id }
  | { kind: "coach"; viewerId: Id; teamIds: Id[] };

/** GET /records row plus the names the queue shows. */
export interface ReviewItem extends StudentRecord {
  recordedByName: string;
  student: { id: Id; name: string; teamId: Id | null; teamName: string | null };
}

/**
 * Review history the fixtures don't carry: the activity log shows Patrick verifying
 * Jean's free throws (8 of 10) yesterday, and Samuel Iradukunda's three-pointers were
 * reviewed earlier, so neither is still waiting.
 */
const REVIEWED: Record<Id, Pick<StudentRecord, "status" | "verifiedBy">> = {
  "record-jean-free-throws": { status: "verified", verifiedBy: "user-patrick" },
  "record-samuel-i-three-pt": { status: "verified", verifiedBy: "user-marie" },
};

let store: StudentRecord[] = studentRecords.map((record) => ({
  ...record,
  ...REVIEWED[record.id],
}));

function nameOf(userId: Id): string {
  return users.find((u) => u.id === userId)?.name ?? "Someone";
}

function studentOf(academyId: Id, studentId: Id): ReviewItem["student"] {
  const member = members.find(
    (m) => m.academyId === academyId && m.userId === studentId
  );
  const teamId = member?.teamIds[0] ?? null;
  return {
    id: studentId,
    name: nameOf(studentId),
    teamId,
    teamName: teams.find((t) => t.id === teamId)?.name ?? null,
  };
}

function toItem(record: StudentRecord): ReviewItem {
  return {
    ...record,
    student: studentOf(record.academyId, record.studentId),
    recordedByName: nameOf(record.recordedBy),
  };
}

function inScope(item: ReviewItem, scope: ReviewScope): boolean {
  if (scope.kind === "admin") {
    return true;
  }
  return (
    item.recordedBy !== scope.viewerId &&
    item.student.teamId !== null &&
    scope.teamIds.includes(item.student.teamId)
  );
}

/**
 * Real: `GET /api/v1/academies/:academyId/records?status=` (one call per tab; the
 * pending count comes from the pending call). Oldest first by date recorded, so the queue is fair.
 */
export async function listReviewRecords(
  academyId: Id,
  params: { scope: ReviewScope; status: RecordStatus | null }
): Promise<ReviewItem[]> {
  await fixtureDelay();
  return store
    .filter((record) => record.academyId === academyId)
    .filter((record) => !params.status || record.status === params.status)
    .map(toItem)
    .filter((item) => inScope(item, params.scope))
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
}

/** Short name of what was recorded, for the activity log ("report card", "free throws · 7 of 10"). */
function auditSummary(record: StudentRecord): string {
  const { data } = record;
  if (record.recordType === "academic") {
    return "report card";
  }
  const drill = String(data.drill ?? "result").replaceAll("_", " ");
  return typeof data.made === "number" && typeof data.attempts === "number"
    ? `${drill} · ${data.made} of ${data.attempts}`
    : drill;
}

function review(
  academyId: Id,
  recordId: Id,
  actorId: Id,
  status: "verified" | "rejected",
  reason: string | null
): ReviewItem {
  const record = store.find(
    (r) => r.id === recordId && r.academyId === academyId
  );
  if (!record) {
    throw new Error("Record not found.");
  }
  if (record.status !== "pending") {
    throw new Error("This record has already been reviewed.");
  }
  if (record.recordedBy === actorId) {
    throw new Error("You can't review a record you entered yourself.");
  }
  const updated: StudentRecord = {
    ...record,
    status,
    verifiedBy: actorId,
    reviewNote: reason,
  };
  store = store.map((r) => (r.id === recordId ? updated : r));
  appendAuditEntry({
    academyId,
    actorId,
    action: status === "verified" ? "record.verify" : "record.reject",
    entityType: "student_record",
    entityId: recordId,
    before: { status: "pending" },
    after: { status, reviewed_at: mockNow().toISOString().slice(0, 16) },
    reason,
    subject: { id: record.studentId, name: nameOf(record.studentId) },
    summary: auditSummary(record),
  });
  return toItem(updated);
}

/** Real: `POST /api/v1/academies/:academyId/records/:id/verify`. Not the recorder (403); not pending (409). */
export async function verifyRecord(
  academyId: Id,
  recordId: Id,
  actorId: Id
): Promise<ReviewItem> {
  await fixtureDelay();
  return review(academyId, recordId, actorId, "verified", null);
}

/** Real: `POST /api/v1/academies/:academyId/records/:id/reject` with `{ reason }`; the student sees the note. */
export async function rejectRecord(
  academyId: Id,
  recordId: Id,
  input: { reason: string },
  actorId: Id
): Promise<ReviewItem> {
  await fixtureDelay();
  return review(academyId, recordId, actorId, "rejected", input.reason);
}

/** The current time; fixture time in mock mode. */
export function recordsNow(): Date {
  return mockNow();
}
