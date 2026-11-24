/*
 * Student records (ST-6 upload, ST-7 progress). Data-layer convention: see
 * features/viewer/api.ts.
 */
import { loadMyTeams } from "@/features/student-calendar/api";
import { uploadContentType } from "@/features/student-records/upload-rules";
import type {
  AcademyRole,
  DateOnly,
  Id,
  Paginated,
  RecordStatus,
  RecordType,
  Timestamp,
} from "@/features/types";
import {
  ApiError,
  academyPath,
  apiAll,
  apiData,
  apiRaw,
} from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** A person named on a record, with their roles in the academy (for "Coach Patrick"). */
export interface PersonRef {
  id: Id;
  name: string;
  roles: AcademyRole[];
}

/**
 * A record as the student's screens show it (the server's record shape, with people
 * resolved). `reviewedBy` is whoever verified or rejected it (the server keeps both in
 * `verifiedBy`); the server does not store when it was reviewed, so `reviewedAt` is
 * null in real mode.
 */
export interface StudentRecordView {
  academyId: Id;
  createdAt: Timestamp;
  /** Validated on the server against `data.template` + `schemaVersion`. */
  data: Record<string, unknown>;
  /** Short-lived signed URL, only from GET /records/:id. */
  fileUrl: string | null;
  hasFile: boolean;
  id: Id;
  recordedByPerson: PersonRef | null;
  recordedOn: DateOnly;
  recordType: RecordType;
  reviewedAt: Timestamp | null;
  reviewedBy: PersonRef | null;
  reviewNote: string | null;
  schemaVersion: number;
  status: RecordStatus;
  studentId: Id;
  /** `data.template`, e.g. "report_card" or "sprint_100m". */
  template: string | null;
}

/** Report card, certificate or other academic document (the template key). */
export type AcademicKind = "report_card" | "certificate" | "other";

/** For progress charts: which field is the result, and which way is better. */
export interface RecordMetric {
  better: "higher" | "lower";
  field: string;
  label: string;
  unit: string | null;
}

/** One entry of GET /record-templates. */
export interface RecordTemplate {
  description: string;
  /** JSON Schema of `data` (the form's fields are its `properties`). */
  jsonSchema: { properties?: Record<string, unknown>; required?: string[] };
  key: string;
  label: string;
  latest: boolean;
  metrics: RecordMetric[];
  recordType: RecordType;
  schemaVersion: number;
}

export interface ListRecordsParams {
  recordType?: RecordType;
  status?: RecordStatus;
}

interface NameRef {
  id: Id;
  name: string;
}

/** A record as the server sends it. */
interface RecordRow {
  academyId: Id;
  createdAt: Timestamp;
  data: Record<string, unknown>;
  file?: { expiresAt: Timestamp; url: string } | null;
  hasFile: boolean;
  id: Id;
  recordedBy: NameRef | null;
  recordedById: Id;
  recordedOn: DateOnly;
  recordType: RecordType;
  reviewNote: string | null;
  schemaVersion: number;
  status: RecordStatus;
  studentId: Id;
  template: string | null;
  verifiedBy: NameRef | null;
  verifiedById: Id | null;
}

type Roles = Map<Id, { roles: AcademyRole[] }>;

async function loadRoles(academyId: Id): Promise<Roles> {
  try {
    return (await loadMyTeams(academyId)).people;
  } catch {
    // Without the roster, people are shown by name only.
    return new Map();
  }
}

function person(ref: NameRef | null, roles: Roles): PersonRef | null {
  return ref
    ? { id: ref.id, name: ref.name, roles: roles.get(ref.id)?.roles ?? [] }
    : null;
}

function toView(row: RecordRow, roles: Roles): StudentRecordView {
  return {
    id: row.id,
    academyId: row.academyId,
    studentId: row.studentId,
    recordType: row.recordType,
    template: row.template,
    schemaVersion: row.schemaVersion,
    recordedOn: row.recordedOn,
    data: row.data,
    status: row.status,
    reviewNote: row.reviewNote,
    createdAt: row.createdAt,
    hasFile: row.hasFile,
    fileUrl: row.file?.url ?? null,
    recordedByPerson: person(row.recordedBy, roles),
    reviewedBy: row.status === "pending" ? null : person(row.verifiedBy, roles),
    reviewedAt: null,
  };
}

/**
 * GET /api/v1/academies/:academyId/record-templates?latest=true
 * The forms records are made from, with the metrics progress charts use.
 */
export async function listRecordTemplates(
  academyId: Id,
  recordType?: RecordType
): Promise<RecordTemplate[]> {
  if (mock) {
    return (await mock()).listRecordTemplates(academyId, recordType);
  }
  return await apiData<RecordTemplate[]>(
    academyPath(academyId, "/record-templates"),
    { query: { latest: "true", recordType } }
  );
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
  if (mock) {
    return (await mock()).listStudentRecords(academyId, studentId, params);
  }
  const [rows, roles] = await Promise.all([
    apiAll<RecordRow>(
      academyPath(academyId, `/students/${studentId}/records`),
      { query: { recordType: params.recordType, status: params.status } }
    ),
    loadRoles(academyId),
  ]);
  return { data: rows.map((row) => toView(row, roles)), nextCursor: null };
}

/**
 * GET /api/v1/academies/:academyId/records/:id
 * `fileUrl` is a short-lived signed URL when the record has a file.
 */
export async function getRecord(
  academyId: Id,
  recordId: Id
): Promise<StudentRecordView> {
  if (mock) {
    return (await mock()).getRecord(academyId, recordId);
  }
  const [row, roles] = await Promise.all([
    apiData<RecordRow>(academyPath(academyId, `/records/${recordId}`)),
    loadRoles(academyId),
  ]);
  return toView(row, roles);
}

export interface CreateUploadInput {
  contentType: string;
  fileName: string;
  size: number;
}

export interface SignedUpload {
  fileKey: string;
  headers: Record<string, string>;
  method: string;
  uploadUrl: string;
}

/**
 * POST /api/v1/academies/:academyId/uploads
 * Checks type (PDF, JPEG, PNG) and size (up to 10 MB) and returns a signed URL to put
 * the file straight into the private bucket. 503 `storage_not_configured` when the
 * server has no bucket.
 */
export async function createUpload(
  academyId: Id,
  input: CreateUploadInput
): Promise<SignedUpload> {
  if (mock) {
    return (await mock()).createUpload(academyId, input);
  }
  return await apiData<SignedUpload>(academyPath(academyId, "/uploads"), {
    method: "POST",
    body: input,
  });
}

/** PUT the file to the signed URL with exactly the headers the server signed. */
async function putFile(upload: SignedUpload, file: File): Promise<void> {
  let response: Response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: upload.method || "PUT",
      headers: upload.headers,
      body: file,
    });
  } catch (error) {
    throw new ApiError(
      {
        status: 0,
        code: "upload_failed",
        message: "The file didn’t upload. Check your connection and try again.",
      },
      { cause: error }
    );
  }
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: "upload_failed",
      message: "The file didn’t upload. Try again.",
    });
  }
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
  if (mock) {
    return (await mock()).createRecord(academyId, studentId, input);
  }
  const [row, roles] = await Promise.all([
    apiData<RecordRow>(
      academyPath(academyId, `/students/${studentId}/records`),
      { method: "POST", body: input }
    ),
    loadRoles(academyId),
  ]);
  return toView(row, roles);
}

export interface UploadRecordInput {
  academyId: Id;
  /** The template's fields, `template` included. */
  data: Record<string, unknown>;
  /** Optional: a record can be sent with the values typed in and no file. */
  file: File | null;
  recordedOn: DateOnly;
  schemaVersion: number;
  studentId: Id;
}

export interface UploadRecordResult {
  record: StudentRecordView;
}

/**
 * Send an academic record: with a file, POST /uploads, PUT the file, then
 * POST /students/:studentId/records with the fileKey; without one, only the last step.
 * When the server has no storage (503 `storage_not_configured`) nothing is saved and
 * the error is thrown, so the form can drop the file and offer to send without it
 * ("Upload a record, no file", FDO-0) instead of quietly losing it.
 */
export async function uploadRecord(
  input: UploadRecordInput
): Promise<UploadRecordResult> {
  if (mock) {
    return (await mock()).uploadRecord(input);
  }
  let fileKey: string | undefined;
  if (input.file) {
    const upload = await createUpload(input.academyId, {
      fileName: input.file.name,
      contentType: uploadContentType(input.file) ?? input.file.type,
      size: input.file.size,
    });
    await putFile(upload, input.file);
    ({ fileKey } = upload);
  }
  const record = await createRecord(input.academyId, input.studentId, {
    recordType: "academic",
    recordedOn: input.recordedOn,
    schemaVersion: input.schemaVersion,
    data: input.data,
    ...(fileKey ? { fileKey } : {}),
  });
  return { record };
}

/**
 * DELETE /api/v1/academies/:academyId/records/:id
 * Only the recorder, only while the record is pending (409 `record_not_pending`).
 */
export async function deleteRecord(academyId: Id, recordId: Id): Promise<void> {
  if (mock) {
    return (await mock()).deleteRecord(academyId, recordId);
  }
  await apiRaw<null>(academyPath(academyId, `/records/${recordId}`), {
    method: "DELETE",
  });
}
