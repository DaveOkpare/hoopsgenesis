/*
 * Coach Today (CO-1): the "Records waiting for you" panel and the phone nudge.
 * Sessions come from features/sessions, the team table from features/team-detail.
 * The full review queue is /coach/records (another feature); this reads only what the
 * panel needs. Fixture-backed; see the convention in features/viewer/api.ts.
 */
import {
  listReviewRecords,
  verifyRecord as verifyReviewRecord,
} from "@/features/records/api";
import type { Id, RecordType, StudentRecord } from "@/features/types";

export interface RecordToReview {
  id: Id;
  recordType: RecordType;
  studentId: Id;
  studentName: string;
  /** "Free throws · 8 of 10", "Report card · Term 3". */
  summary: string;
  teamName: string | null;
}

const DRILL_LABEL: Record<string, string> = {
  free_throws: "Free throws",
  three_point: "3-pt shooting",
  penalty_kicks: "Penalty kicks",
  dribbling: "Dribbling",
};

function summarize(record: StudentRecord): string {
  const { data } = record;
  if (record.recordType === "athletic") {
    const label = DRILL_LABEL[String(data.drill)] ?? String(data.drill);
    if (typeof data.seconds === "number") {
      return `${label} · ${data.seconds} s`;
    }
    return `${label} · ${data.made} of ${data.attempts}`;
  }
  const term = typeof data.term === "string" ? data.term.split(",")[0] : null;
  return term ? `Report card · ${term}` : "Report card";
}

/**
 * Pending records on the coach's teams, oldest first, excluding their own entries.
 * Real: GET /records?status=pending (the server scopes it to the coach's teams).
 * Same source as the full queue at /coach/records, so the panel, the sidebar count
 * and the queue always agree.
 */
export async function listRecordsToReview(
  academyId: Id,
  params: { teamIds: Id[]; viewerId: Id }
): Promise<RecordToReview[]> {
  const items = await listReviewRecords(academyId, {
    scope: { kind: "coach", ...params },
    status: "pending",
  });
  return items.map((item) => ({
    id: item.id,
    recordType: item.recordType,
    studentId: item.studentId,
    studentName: item.student.name,
    teamName: item.student.teamName,
    summary: summarize(item),
  }));
}

/** One-tap verify (CO-9). Real: POST /records/:id/verify. */
export function verifyRecord(
  academyId: Id,
  input: { recordId: Id; verifiedBy: Id }
): Promise<StudentRecord> {
  return verifyReviewRecord(academyId, input.recordId, input.verifiedBy);
}
