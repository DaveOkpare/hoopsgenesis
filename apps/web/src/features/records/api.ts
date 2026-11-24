/*
 * Records (CO-9): the coach review queue and the academy admin's read-only list, both
 * from `GET /records?status=`,
 * `GET /records/:id` (signed file URL), `POST /records/:id/verify` and
 * `POST /records/:id/reject`. The student upload side lives in features/student-records.
 * Preview mode uses ./api.mock.ts (see lib/preview.ts).
 *
 * The server scopes the queue by the session: admins see the whole academy, coaches
 * their teams' students; nobody sees records they recorded or that are about themself.
 */
import { loadStudentDirectory } from "@/features/fees/student-directory";
import type {
  Id,
  RecordStatus,
  RecordType,
  StudentRecord,
  Timestamp,
} from "@/features/types";
import {
  academyPath,
  apiAll,
  apiData,
  apiPage,
  MAX_PAGE_SIZE,
} from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/**
 * Who is asking. Part of the query key (admin and coach queues are cached apart); the
 * server scopes by the session, so only the preview mock reads it.
 */
export type ReviewScope =
  | { kind: "admin"; viewerId: Id }
  | { kind: "coach"; viewerId: Id; teamIds: Id[] };

/** GET /records row plus the names the queue shows. */
export interface ReviewItem extends StudentRecord {
  /** A file (photo or PDF) is attached; open it through `getRecordFile`. */
  hasFile: boolean;
  recordedByName: string;
  /**
   * Coaches of the student's team who may review it (never the recorder or the student
   * themself), by name. Empty when the team has no coach or the student has no team.
   */
  reviewerNames: string[];
  student: { id: Id; name: string; teamId: Id | null; teamName: string | null };
  /** The student's team has at least one coach (who may be the recorder). */
  teamHasCoach: boolean;
  /** Who verified or rejected it; null while pending. */
  verifiedByName: string | null;
}

/** A short-lived download link from GET /records/:id. */
export interface RecordFile {
  expiresAt: Timestamp;
  url: string;
}

const STATUSES: readonly RecordStatus[] = ["pending", "verified", "rejected"];

/** A record as the server sends it (server/api/v1/records-shared.ts). */
interface ServerRecord {
  academyId: Id;
  createdAt: Timestamp;
  data: Record<string, unknown>;
  hasFile: boolean;
  id: Id;
  recordedBy: { id: Id; name: string } | null;
  recordedById: Id;
  recordedOn: string;
  recordType: RecordType;
  reviewNote: string | null;
  schemaVersion: number;
  status: RecordStatus;
  student: { id: Id; name: string } | null;
  studentId: Id;
  verifiedBy: { id: Id; name: string } | null;
  verifiedById: Id | null;
}

interface StudentTeam {
  coaches: { id: Id; name: string }[];
  teamId: Id | null;
  teamName: string | null;
}

function toItem(row: ServerRecord, teams: Map<Id, StudentTeam>): ReviewItem {
  const team = teams.get(row.studentId);
  return {
    id: row.id,
    academyId: row.academyId,
    studentId: row.studentId,
    recordType: row.recordType,
    recordedOn: row.recordedOn,
    data: row.data,
    schemaVersion: row.schemaVersion,
    status: row.status,
    recordedBy: row.recordedById,
    verifiedBy: row.verifiedById,
    reviewNote: row.reviewNote,
    fileUrl: null,
    hasFile: row.hasFile,
    createdAt: row.createdAt,
    recordedByName: row.recordedBy?.name ?? "Someone",
    reviewerNames: (team?.coaches ?? [])
      .filter(
        (coach) => coach.id !== row.recordedById && coach.id !== row.studentId
      )
      .map((coach) => coach.name),
    teamHasCoach: (team?.coaches.length ?? 0) > 0,
    verifiedByName: row.verifiedBy?.name ?? null,
    student: {
      id: row.studentId,
      name: row.student?.name ?? "Student",
      teamId: team?.teamId ?? null,
      teamName: team?.teamName ?? null,
    },
  };
}

async function studentTeams(academyId: Id): Promise<Map<Id, StudentTeam>> {
  const directory = await loadStudentDirectory(academyId);
  const coachesOf = new Map(
    directory.teams.map((team) => [
      team.id,
      team.coachIds.map((id) => ({
        id,
        name: directory.people.get(id)?.name ?? "Coach",
      })),
    ])
  );
  return new Map(
    [...directory.people].map(([id, person]) => [
      id,
      {
        teamId: person.teamId,
        teamName: person.teamName,
        coaches: person.teamId ? (coachesOf.get(person.teamId) ?? []) : [],
      },
    ])
  );
}

/**
 * `GET /records?status=` (one call per status when `status` is null; the newest 200 of
 * each). Oldest first by date recorded, so the queue is fair.
 */
export async function listReviewRecords(
  academyId: Id,
  params: { scope: ReviewScope; status: RecordStatus | null }
): Promise<ReviewItem[]> {
  if (mock) {
    return (await mock()).listReviewRecords(academyId, params);
  }
  const statuses = params.status ? [params.status] : STATUSES;
  const [teams, ...pages] = await Promise.all([
    studentTeams(academyId),
    ...statuses.map((status) =>
      apiPage<ServerRecord>(academyPath(academyId, "/records"), {
        query: { status, limit: MAX_PAGE_SIZE },
      })
    ),
  ]);
  return pages
    .flatMap((page) => page.data)
    .map((row) => toItem(row, teams))
    .sort((a, b) => a.recordedOn.localeCompare(b.recordedOn));
}

async function review(
  academyId: Id,
  recordId: Id,
  action: "verify" | "reject",
  body: Record<string, string>
): Promise<ReviewItem> {
  const [row, teams] = await Promise.all([
    apiData<ServerRecord>(
      academyPath(
        academyId,
        `/records/${encodeURIComponent(recordId)}/${action}`
      ),
      { method: "POST", body }
    ),
    studentTeams(academyId),
  ]);
  return toItem(row, teams);
}

/**
 * `POST /records/:id/verify`. 403 `cannot_review_own_record` (they recorded it or it is
 * about them); 409 `record_not_pending`. The error message says which.
 */
export async function verifyRecord(
  academyId: Id,
  recordId: Id
): Promise<ReviewItem> {
  if (mock) {
    return (await mock()).verifyRecord(academyId, recordId);
  }
  return await review(academyId, recordId, "verify", {});
}

/** `POST /records/:id/reject` with `{ reason }`; the student sees the note. */
export async function rejectRecord(
  academyId: Id,
  recordId: Id,
  input: { reason: string }
): Promise<ReviewItem> {
  if (mock) {
    return (await mock()).rejectRecord(academyId, recordId, input);
  }
  return await review(academyId, recordId, "reject", { reason: input.reason });
}

/**
 * `GET /records/:id`: a signed download URL for the attached file, or null when there
 * is none. Without object storage configured the server answers 503
 * `storage_not_configured` (thrown as ApiError).
 */
export async function getRecordFile(
  academyId: Id,
  recordId: Id
): Promise<RecordFile | null> {
  if (mock) {
    return (await mock()).getRecordFile(academyId, recordId);
  }
  const row = await apiData<{ file: RecordFile | null }>(
    academyPath(academyId, `/records/${encodeURIComponent(recordId)}`)
  );
  return row.file;
}

/** Records waiting for the caller's review, for the sidebar badge (`GET /records`). */
export async function countPendingRecords(academyId: Id): Promise<number> {
  if (mock) {
    return (await mock()).countPendingRecords(academyId);
  }
  const rows = await apiAll<ServerRecord>(academyPath(academyId, "/records"), {
    query: { status: "pending" },
  });
  return rows.length;
}
