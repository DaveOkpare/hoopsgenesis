/*
 * Aline's records beyond the shared fixtures: her free-throw and three-point results
 * ("[Student] My progress", 47V-0) and the Term 2 report card her coach rejected
 * ("Record rejected", 5DZ-0). Her pending Term 3 report card is in the shared fixtures.
 * Only student-records/api.ts imports this file.
 */
import { studentRecords } from "@/features/fixtures";
import type { StudentRecord, Timestamp } from "@/features/types";

export const STUDENT_ID = "user-aline";

/**
 * Review details the schema does not have yet: who reviewed (verified or rejected) a
 * record and when. `verifiedBy` alone can't say who rejected one.
 */
export interface FixtureReview {
  reviewedAt: Timestamp;
  reviewedBy: string;
}

function athletic(
  id: string,
  drill: "free_throws" | "three_point",
  recordedOn: string,
  made: number,
  review: { by: string; at: Timestamp } | null
): StudentRecord & { review: FixtureReview | null } {
  return {
    id,
    academyId: "acad-kigali",
    studentId: STUDENT_ID,
    recordType: "athletic",
    recordedBy: "user-patrick",
    recordedOn,
    data: { sport: "basketball", drill, made, attempts: 10 },
    schemaVersion: 1,
    fileUrl: null,
    status: review ? "verified" : "pending",
    verifiedBy: review?.by ?? null,
    createdAt: `${recordedOn}T15:40:00Z`,
    reviewNote: null,
    review: review ? { reviewedAt: review.at, reviewedBy: review.by } : null,
  };
}

const PATRICK = "user-patrick";
const SHARIKA = "user-sharika";

export const fixtureRecords: (StudentRecord & {
  review: FixtureReview | null;
})[] = [
  athletic("record-aline-ft-0822", "free_throws", "2026-08-22", 4, {
    by: PATRICK,
    at: "2026-08-22T17:00:00Z",
  }),
  athletic("record-aline-ft-0919", "free_throws", "2026-09-19", 5, {
    by: PATRICK,
    at: "2026-09-19T17:00:00Z",
  }),
  athletic("record-aline-ft-1017", "free_throws", "2026-10-17", 6, {
    by: PATRICK,
    at: "2026-10-17T17:00:00Z",
  }),
  athletic("record-aline-ft-1114", "free_throws", "2026-11-14", 7, {
    by: SHARIKA,
    at: "2026-11-14T17:00:00Z",
  }),
  athletic("record-aline-ft-1123", "free_throws", "2026-11-23", 8, null),
  athletic("record-aline-3pt-0926", "three_point", "2026-09-26", 2, {
    by: PATRICK,
    at: "2026-09-26T17:00:00Z",
  }),
  athletic("record-aline-3pt-1031", "three_point", "2026-10-31", 3, {
    by: PATRICK,
    at: "2026-10-31T17:00:00Z",
  }),
  athletic("record-aline-3pt-1121", "three_point", "2026-11-21", 4, {
    by: PATRICK,
    at: "2026-11-21T17:00:00Z",
  }),
  {
    id: "record-aline-term2",
    academyId: "acad-kigali",
    studentId: STUDENT_ID,
    recordType: "academic",
    recordedBy: STUDENT_ID,
    recordedOn: "2026-11-02",
    data: {
      kind: "report_card",
      school: "Kigali Parents School",
      term: "Term 2, 2026",
      averagePercent: 74,
      position: 8,
      classSize: 42,
      fileName: "IMG_2041.jpg",
      fileSize: 1_800_000,
      contentType: "image/jpeg",
    },
    schemaVersion: 1,
    fileUrl: null,
    status: "rejected",
    verifiedBy: null,
    createdAt: "2026-11-02T16:20:00Z",
    reviewNote:
      "The photo is cut off at the bottom, so I can’t see the head teacher’s signature. Please take it again in good light.",
    review: { reviewedAt: "2026-11-04T09:30:00Z", reviewedBy: PATRICK },
  },
  ...studentRecords
    .filter((r) => r.studentId === STUDENT_ID)
    .map((r) => ({
      ...r,
      data: {
        ...r.data,
        fileName: "report-card-term3.pdf",
        fileSize: 2_100_000,
        contentType: "application/pdf",
      },
      review: null,
    })),
];
