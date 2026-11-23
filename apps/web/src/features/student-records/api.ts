/*
 * Student records (ST-6 upload, ST-7 progress). Mock-data convention: see
 * features/viewer/api.ts. The fixture store is in memory, so a record uploaded in this
 * session shows up until the page reloads.
 */
import { fixtureDelay, members, users } from "@/features/fixtures";
import {
  type FixtureReview,
  fixtureRecords,
} from "@/features/student-records/fixtures";
import {
  uploadContentType,
  uploadProblem,
} from "@/features/student-records/upload-rules";
import type {
  AcademyRole,
  DateOnly,
  Id,
  Paginated,
  RecordStatus,
  RecordType,
  StudentRecord,
  Timestamp,
} from "@/features/types";

/** A person named on a record, with their roles in the academy (for "Coach Patrick"). */
export interface PersonRef {
  id: Id;
  name: string;
  roles: AcademyRole[];
}

/**
 * A record as the student's screens show it. `recordedByPerson`, `reviewedBy` and
 * `reviewedAt` are assumed to be joined by the server: the schema has `verifiedBy` but
 * nothing that says who rejected a record or when it was reviewed.
 */
export interface StudentRecordView extends StudentRecord {
  recordedByPerson: PersonRef | null;
  reviewedAt: Timestamp | null;
  reviewedBy: PersonRef | null;
}

/** Report card, certificate or other academic document (data.kind). */
export type AcademicKind = "report_card" | "certificate" | "other";

export interface ListRecordsParams {
  recordType?: RecordType;
  status?: RecordStatus;
}

type StoredRecord = StudentRecord & { review: FixtureReview | null };

const store: StoredRecord[] = [...fixtureRecords];

function person(userId: Id | null, academyId: Id): PersonRef | null {
  const found = users.find((u) => u.id === userId);
  if (!found) {
    return null;
  }
  const membership = members.find(
    (m) => m.userId === found.id && m.academyId === academyId
  );
  return { id: found.id, name: found.name, roles: membership?.roles ?? [] };
}

function toView({ review, ...record }: StoredRecord): StudentRecordView {
  return {
    ...record,
    recordedByPerson: person(record.recordedBy, record.academyId),
    reviewedBy: review ? person(review.reviewedBy, record.academyId) : null,
    reviewedAt: review?.reviewedAt ?? null,
  };
}

/** Error with the API's `{ error: { code, message } }` code. */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * GET /api/v1/academies/:academyId/students/:studentId/records?recordType=&status=
 * Newest first.
 */
export async function listStudentRecords(
  academyId: Id,
  studentId: Id,
  params: ListRecordsParams = {}
): Promise<Paginated<StudentRecordView>> {
  await fixtureDelay();
  const data = store
    .filter(
      (r) =>
        r.academyId === academyId &&
        r.studentId === studentId &&
        (!params.recordType || r.recordType === params.recordType) &&
        (!params.status || r.status === params.status)
    )
    .sort(
      (a, b) =>
        b.recordedOn.localeCompare(a.recordedOn) ||
        b.createdAt.localeCompare(a.createdAt)
    )
    .map(toView);
  return { data, nextCursor: null };
}

/**
 * GET /api/v1/academies/:academyId/records/:id
 * `fileUrl` is a short-lived signed URL (null in fixtures).
 */
export async function getRecord(
  academyId: Id,
  recordId: Id
): Promise<StudentRecordView> {
  await fixtureDelay();
  const found = store.find(
    (r) => r.id === recordId && r.academyId === academyId
  );
  if (!found) {
    throw new ApiError(404, "not_found", "Record not found");
  }
  return toView(found);
}

export interface CreateUploadInput {
  contentType: string;
  fileName: string;
  size: number;
}

/**
 * POST /api/v1/academies/:academyId/uploads
 * Checks type (PDF, JPEG, PNG) and size (up to 10 MB) and returns a signed URL to put
 * the file straight into the private bucket.
 */
export async function createUpload(
  _academyId: Id,
  input: CreateUploadInput
): Promise<{ fileKey: string; uploadUrl: string }> {
  await fixtureDelay();
  const problem = uploadProblem({
    name: input.fileName,
    size: input.size,
    type: input.contentType,
  });
  if (problem) {
    throw new ApiError(400, "invalid_upload", problem);
  }
  const fileKey = `tmp/${crypto.randomUUID()}/${input.fileName}`;
  return { fileKey, uploadUrl: `https://uploads.invalid/${fileKey}` };
}

/** PUT the file to the signed URL. Fixtures: nothing is sent. */
async function putFile(_uploadUrl: string, _file: File): Promise<void> {
  await fixtureDelay();
}

export interface CreateRecordInput {
  data: Record<string, unknown>;
  fileKey?: string;
  recordedOn: DateOnly;
  recordType: RecordType;
  schemaVersion: number;
}

/**
 * POST /api/v1/academies/:academyId/students/:studentId/records
 * The server sets recordedBy from the session; a new record is always pending.
 */
export async function createRecord(
  academyId: Id,
  studentId: Id,
  input: CreateRecordInput
): Promise<StudentRecordView> {
  await fixtureDelay();
  const record: StoredRecord = {
    id: `record-${crypto.randomUUID()}`,
    academyId,
    studentId,
    recordType: input.recordType,
    recordedBy: studentId,
    recordedOn: input.recordedOn,
    data: input.data,
    schemaVersion: input.schemaVersion,
    fileUrl: null,
    status: "pending",
    verifiedBy: null,
    createdAt: new Date().toISOString(),
    reviewNote: null,
    review: null,
  };
  store.push(record);
  return toView(record);
}

export interface UploadRecordInput {
  academyId: Id;
  data: Record<string, unknown>;
  file: File;
  recordedOn: DateOnly;
  studentId: Id;
}

/**
 * Upload an academic record in one go: POST /uploads, PUT the file, then
 * POST /students/:studentId/records with the fileKey. Resolves to the new, pending record.
 */
export async function uploadRecord(
  input: UploadRecordInput
): Promise<StudentRecordView> {
  const contentType = uploadContentType(input.file) ?? input.file.type;
  const { fileKey, uploadUrl } = await createUpload(input.academyId, {
    fileName: input.file.name,
    contentType,
    size: input.file.size,
  });
  await putFile(uploadUrl, input.file);
  return createRecord(input.academyId, input.studentId, {
    recordType: "academic",
    recordedOn: input.recordedOn,
    schemaVersion: 1,
    fileKey,
    data: {
      ...input.data,
      fileName: input.file.name,
      fileSize: input.file.size,
      contentType,
    },
  });
}
