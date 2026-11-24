/*
 * Preview-mode (fixture) implementation of features/student-records/api.ts. Dev only.
 * The fixture store is in memory, so a record uploaded in this session shows up until
 * the page reloads.
 */
import { fixtureDelay, members, users } from "@/features/fixtures";
import type {
  CreateRecordInput,
  CreateUploadInput,
  ListRecordsParams,
  PersonRef,
  RecordTemplate,
  SignedUpload,
  StudentRecordView,
  UploadRecordInput,
  UploadRecordResult,
} from "@/features/student-records/api";
import {
  type FixtureReview,
  fixtureRecords,
} from "@/features/student-records/fixtures";
import {
  uploadContentType,
  uploadProblem,
} from "@/features/student-records/upload-rules";
import type {
  Id,
  Paginated,
  RecordType,
  StudentRecord,
} from "@/features/types";
import { ApiError } from "@/lib/api-client";

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

/** Coaches on the student's team, minus the recorder and the student (as in api.ts). */
function reviewersOf(record: StudentRecord): PersonRef[] {
  const teamIds =
    members.find(
      (m) => m.userId === record.studentId && m.academyId === record.academyId
    )?.teamIds ?? [];
  return members
    .filter(
      (m) =>
        m.academyId === record.academyId &&
        m.roles.includes("coach") &&
        m.teamIds.some((teamId) => teamIds.includes(teamId)) &&
        m.userId !== record.recordedBy &&
        m.userId !== record.studentId
    )
    .map((m) => ({ id: m.userId, name: m.user.name, roles: m.roles }));
}

function toView({ review, ...record }: StoredRecord): StudentRecordView {
  const template =
    record.data.template ?? record.data.drill ?? record.data.kind;
  return {
    id: record.id,
    academyId: record.academyId,
    studentId: record.studentId,
    recordType: record.recordType,
    template: typeof template === "string" ? template : null,
    schemaVersion: record.schemaVersion,
    recordedOn: record.recordedOn,
    data: record.data,
    status: record.status,
    reviewNote: record.reviewNote,
    createdAt: record.createdAt,
    hasFile: typeof record.data.fileName === "string",
    fileUrl: record.fileUrl,
    recordedByPerson: person(record.recordedBy, record.academyId),
    reviewedBy: review ? person(review.reviewedBy, record.academyId) : null,
    reviewedAt: review?.reviewedAt ?? null,
    reviewers: reviewersOf(record),
  };
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
    throw new ApiError({
      status: 404,
      code: "not_found",
      message: "Record not found",
    });
  }
  return toView(found);
}

/**
 * POST /api/v1/academies/:academyId/uploads
 * Checks type (PDF, JPEG, PNG) and size (up to 10 MB) and returns a signed URL to put
 * the file straight into the private bucket.
 */
export async function createUpload(
  _academyId: Id,
  input: CreateUploadInput
): Promise<SignedUpload> {
  await fixtureDelay();
  const problem = uploadProblem({
    name: input.fileName,
    size: input.size,
    type: input.contentType,
  });
  if (problem) {
    throw new ApiError({
      status: 400,
      code: "invalid_upload",
      message: problem,
    });
  }
  const fileKey = `tmp/${crypto.randomUUID()}/${input.fileName}`;
  return {
    fileKey,
    uploadUrl: `https://uploads.invalid/${fileKey}`,
    method: "PUT",
    headers: { "content-type": input.contentType },
  };
}

/** PUT the file to the signed URL. Fixtures: nothing is sent. */
async function putFile(_uploadUrl: string, _file: File): Promise<void> {
  await fixtureDelay();
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

/**
 * Upload an academic record in one go: POST /uploads, PUT the file, then
 * POST /students/:studentId/records with the fileKey. Resolves to the new, pending record.
 */
export async function uploadRecord(
  input: UploadRecordInput
): Promise<UploadRecordResult> {
  const { file } = input;
  if (!file) {
    const record = await createRecord(input.academyId, input.studentId, {
      recordType: "academic",
      recordedOn: input.recordedOn,
      schemaVersion: input.schemaVersion,
      data: input.data,
    });
    return { record };
  }
  const contentType = uploadContentType(file) ?? file.type;
  const { fileKey, uploadUrl } = await createUpload(input.academyId, {
    fileName: file.name,
    contentType,
    size: file.size,
  });
  await putFile(uploadUrl, file);
  const record = await createRecord(input.academyId, input.studentId, {
    recordType: "academic",
    recordedOn: input.recordedOn,
    schemaVersion: input.schemaVersion,
    fileKey,
    data: {
      ...input.data,
      fileName: file.name,
      fileSize: file.size,
      contentType,
    },
  });
  return { record };
}

/** DELETE /api/v1/academies/:academyId/records/:id (own, pending only). */
export async function deleteRecord(academyId: Id, recordId: Id): Promise<void> {
  await fixtureDelay();
  const index = store.findIndex(
    (r) => r.id === recordId && r.academyId === academyId
  );
  const found = store[index];
  if (!found) {
    throw new ApiError({
      status: 404,
      code: "not_found",
      message: "Record not found",
    });
  }
  if (found.status !== "pending") {
    throw new ApiError({
      status: 409,
      code: "record_not_pending",
      message: "Only a record waiting for review can be deleted",
    });
  }
  store.splice(index, 1);
}

/** Pseudo templates for the fixture records (drills and academic kinds). */
const PREVIEW_TEMPLATES: RecordTemplate[] = [
  {
    key: "free_throws",
    recordType: "athletic",
    schemaVersion: 1,
    label: "Free throws",
    description: "Free throws made out of 10.",
    latest: true,
    metrics: [
      { field: "made", label: "Free throws", unit: null, better: "higher" },
    ],
    jsonSchema: { properties: { drill: {}, made: {}, attempts: {} } },
  },
  {
    key: "three_point",
    recordType: "athletic",
    schemaVersion: 1,
    label: "3-pt shooting",
    description: "Threes made out of 10.",
    latest: true,
    metrics: [
      { field: "made", label: "3-pt shooting", unit: null, better: "higher" },
    ],
    jsonSchema: { properties: { drill: {}, made: {}, attempts: {} } },
  },
  {
    key: "report_card",
    recordType: "academic",
    schemaVersion: 1,
    label: "Report card",
    description: "A term's report card.",
    latest: true,
    metrics: [],
    jsonSchema: {
      properties: {
        kind: {},
        school: {},
        term: {},
        averagePercent: {},
        position: {},
        classSize: {},
      },
    },
  },
  {
    key: "certificate",
    recordType: "academic",
    schemaVersion: 1,
    label: "Certificate",
    description: "A certificate.",
    latest: true,
    metrics: [],
    jsonSchema: { properties: { kind: {}, title: {}, issuedBy: {} } },
  },
  {
    key: "other",
    recordType: "academic",
    schemaVersion: 1,
    label: "Other",
    description: "Any other document.",
    latest: true,
    metrics: [],
    jsonSchema: { properties: { kind: {}, title: {}, note: {} } },
  },
];

export async function listRecordTemplates(
  _academyId: Id,
  recordType?: RecordType
): Promise<RecordTemplate[]> {
  await fixtureDelay();
  return PREVIEW_TEMPLATES.filter(
    (template) => !recordType || template.recordType === recordType
  );
}
