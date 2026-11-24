/*
 * Preview-mode (fixture) implementation of features/records/api.ts. Dev only.
 * Records review queue (CO-9), coach and admin side. Mock implementations of
 * `GET /records`, `POST /records/:id/verify` and `POST /records/:id/reject` (see the
 * convention notes in features/viewer/api.ts). The student upload side lives in
 * features/student-records.
 */
import { appendAuditEntry, mockNow } from "@/features/audit-log/api.mock";
import {
  fixtureDelay,
  members,
  studentRecords,
  teams,
  users,
} from "@/features/fixtures";
import type {
  RecordFile,
  ReviewItem,
  ReviewScope,
} from "@/features/records/api";
import type { Id, RecordStatus, StudentRecord } from "@/features/types";

/** Who reviews in preview: Sharika (admin and coach in the designs). */
const PREVIEW_ACTOR_ID: Id = "user-sharika";

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

/** Coaches of the student's team, minus the recorder and the student themself. */
function reviewersOf(record: StudentRecord, teamId: Id | null): string[] {
  if (!teamId) {
    return [];
  }
  return members
    .filter(
      (m) =>
        m.academyId === record.academyId &&
        m.roles.includes("coach") &&
        m.teamIds.includes(teamId) &&
        m.userId !== record.recordedBy &&
        m.userId !== record.studentId
    )
    .map((m) => m.user.name);
}

function toItem(record: StudentRecord): ReviewItem {
  const student = studentOf(record.academyId, record.studentId);
  return {
    ...record,
    hasFile: record.recordType === "academic",
    student,
    recordedByName: nameOf(record.recordedBy),
    reviewerNames: reviewersOf(record, student.teamId),
    teamHasCoach: members.some(
      (m) =>
        m.academyId === record.academyId &&
        m.roles.includes("coach") &&
        student.teamId !== null &&
        m.teamIds.includes(student.teamId)
    ),
    verifiedByName: record.verifiedBy ? nameOf(record.verifiedBy) : null,
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
  recordId: Id
): Promise<ReviewItem> {
  await fixtureDelay();
  return review(academyId, recordId, PREVIEW_ACTOR_ID, "verified", null);
}

/** Real: `POST /api/v1/academies/:academyId/records/:id/reject` with `{ reason }`; the student sees the note. */
export async function rejectRecord(
  academyId: Id,
  recordId: Id,
  input: { reason: string }
): Promise<ReviewItem> {
  await fixtureDelay();
  return review(
    academyId,
    recordId,
    PREVIEW_ACTOR_ID,
    "rejected",
    input.reason
  );
}

/** Preview has no stored files; the queue shows the drawn document instead. */
export async function getRecordFile(
  _academyId: Id,
  _recordId: Id
): Promise<RecordFile | null> {
  await fixtureDelay();
  return null;
}

export async function countPendingRecords(academyId: Id): Promise<number> {
  const items = await listReviewRecords(academyId, {
    scope: { kind: "admin", viewerId: PREVIEW_ACTOR_ID },
    status: "pending",
  });
  return items.length;
}
