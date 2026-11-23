/*
 * Preview-mode (fixture) implementation of features/coach-today/api.ts. Dev only.
 * Reads the records feature's fixture queue, so the panel and /coach/records agree.
 */

import type { RecordToReview } from "@/features/coach-today/api";
import {
  listReviewRecords,
  verifyRecord as verifyReviewRecord,
} from "@/features/records/api.mock";
import type { Id, StudentRecord } from "@/features/types";

/** The preview coach (Sharika). */
const PREVIEW_VIEWER = "user-sharika";

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

export async function listRecordsToReview(
  academyId: Id,
  params: { teams: { id: Id; name: string }[] }
): Promise<RecordToReview[]> {
  const items = await listReviewRecords(academyId, {
    scope: {
      kind: "coach",
      teamIds: params.teams.map((t) => t.id),
      viewerId: PREVIEW_VIEWER,
    },
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

export async function verifyRecord(
  academyId: Id,
  input: { recordId: Id }
): Promise<{ id: Id }> {
  const record = await verifyReviewRecord(academyId, input.recordId);
  return { id: record.id };
}
