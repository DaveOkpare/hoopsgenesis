/**
 * Student records: academic and athletic, pending until a reviewer verifies
 * or rejects them, then final (a correction is a new record).
 *
 * Paths are under /api/v1/academies/:academyId.
 *
 * POST   /students/:studentId/records   record:create
 *        student: own, academic only; coach of the student's team: academic
 *        or athletic; academy admin: either.
 *        `{ recordType, recordedOn, schemaVersion, data: { template, ... },
 *        fileKey? }`
 * GET    /students/:studentId/records   record:read, scoped (student own,
 *        coach own teams, academy admin). `?recordType=&status=&template=
 *        &from=&to=` (recordedOn, inclusive). Newest recordedOn first.
 * GET    /records                       record:verify. The review queue:
 *        `?status=` (default pending), `?recordType=`, `?studentId=`. Coach:
 *        own teams' students; academy admin: all. Never the caller's own
 *        uploads or records about the caller. Pending: oldest first;
 *        verified/rejected: newest first.
 * GET    /records/:id                   record:read, scoped; adds
 *        `file: { url, expiresAt }` (signed, 5 minutes) or null.
 * PATCH  /records/:id                   only the recorder, only while pending,
 *        and only as a coach or student: an academy admin may delete a
 *        pending record but not edit it (API endpoints, Access by role)
 *        `{ recordedOn?, schemaVersion?, data?, fileKey? (null removes) }`
 * DELETE /records/:id                   recorder, academy admin; only pending
 * POST   /records/:id/verify            record:verify, coach of the
 *        student's team, academy admin; never the recorder or the student
 *        themself. Audited (record.verify).
 * POST   /records/:id/reject            same; `{ reason }` -> review_note.
 *        Audited (record.reject).
 *
 * The platform owner reads GET /students/:studentId/records, GET /records
 * and GET /records/:id through ./admin-academy-views.ts (same code, a
 * read-only member that sees the whole academy; still never the storage key).
 *
 * Errors beyond the usual 401/404/403/400: 403 `record_type_not_allowed`,
 * `not_recorder`, `cannot_review_own_record`, `file_not_owned`; 409
 * `record_not_pending`; 422 `recorded_on_in_future`, `file_not_uploaded`;
 * 503 `storage_not_configured`.
 */
import type { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccess,
  type AcademyAccessResolver,
  academyAccessWith,
  requireAcademyAccess,
} from "../access";
import { writeAuditLog } from "../audit";
import type { RecordType } from "../config/record-templates";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from "../errors";
import {
  type ApiContext,
  type ApiHandler,
  apiHandler,
  created,
  json,
  noContent,
} from "../handler";
import {
  encodeTimeIdCursor,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import type { AcademyMember } from "../roles";
import {
  canSeeStudent,
  getStudentIdsForCoach,
  isCoachOfStudent,
  isStudentOfAcademy,
} from "../scope";
import { fromPlainDate, plainDateRange, toTimestamp } from "../serialize";
import { DOWNLOAD_URL_SECONDS, requireStorage } from "../storage/storage";
import {
  idSchema,
  isoDateSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
} from "../validation";
import {
  type AttachedFile,
  assertNotInFuture,
  attachUpload,
  deleteObjectsQuietly,
  fileKeySchema,
  loadVisibleRecord,
  type RecordRow,
  recordDataSchema,
  recordInclude,
  recordStatusSchema,
  recordTypeSchema,
  schemaVersionSchema,
  serializeRecord,
  templateKeySchema,
  toAuditSnapshot,
  validateRecordData,
} from "./records-shared";

const MAX_REASON_LENGTH = 1000;

const studentParamsSchema = z.object({ studentId: idSchema });
const recordParamsSchema = z.object({ id: idSchema });

const notPending = () =>
  new ConflictError("This record has been reviewed and is final", {
    code: "record_not_pending",
  });

// ---------------------------------------------------------------- create

const createBodySchema = z.object({
  recordType: recordTypeSchema,
  recordedOn: isoDateSchema,
  schemaVersion: schemaVersionSchema,
  data: recordDataSchema,
  fileKey: fileKeySchema.optional(),
});

/**
 * Who may record which type for `studentId` (already known to be a student
 * of the academy and visible to `member`).
 */
const mayRecord = async (
  member: AcademyMember,
  studentId: string,
  recordType: RecordType
): Promise<boolean> => {
  if (member.isAdmin) {
    return true;
  }
  const isSelf = member.userId === studentId;
  if (recordType === "academic" && isSelf && member.isStudent) {
    return true;
  }
  // Coaches record for students on their teams, not for themselves.
  return (
    member.isCoach &&
    !isSelf &&
    (await isCoachOfStudent(db, member.academyId, member.userId, studentId))
  );
};

export const createStudentRecord = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    record: ["create"],
  });
  const { studentId } = parseParams(studentParamsSchema, ctx.params);
  const input = parseBody(createBodySchema, await readJsonBody(ctx.request));

  const visible =
    (await isStudentOfAcademy(db, academy.id, studentId)) &&
    (await canSeeStudent(db, member, studentId));
  if (!visible) {
    throw new NotFoundError("Student not found");
  }
  if (!(await mayRecord(member, studentId, input.recordType))) {
    throw new ForbiddenError(
      `You may not record ${input.recordType} records for this student`,
      { code: "record_type_not_allowed" }
    );
  }
  const data = validateRecordData(
    input.recordType,
    input.schemaVersion,
    input.data
  );
  assertNotInFuture(input.recordedOn, academy.timezone);

  const file = input.fileKey
    ? await attachUpload(input.fileKey, {
        academyId: academy.id,
        uploaderId: session.user.id,
        studentId,
      })
    : null;

  let row: RecordRow;
  try {
    row = await db.studentRecord.create({
      data: {
        academyId: academy.id,
        studentId,
        recordType: input.recordType,
        recordedById: session.user.id,
        recordedOn: fromPlainDate(input.recordedOn),
        schemaVersion: input.schemaVersion,
        data,
        fileUrl: file?.permanentKey ?? null,
      },
      include: recordInclude,
    });
  } catch (error) {
    await deleteObjectsQuietly([file?.permanentKey]);
    throw error;
  }
  await deleteObjectsQuietly([file?.tmpKey]);
  return created({ data: serializeRecord(row) });
});

// ---------------------------------------------------------------- lists

const studentListQuerySchema = z.object({
  ...paginationQueryShape,
  recordType: recordTypeSchema.optional(),
  status: recordStatusSchema.optional(),
  template: templateKeySchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const recordReader = academyAccessWith({ record: ["read"] });

/** GET /students/:studentId/records for `resolve`'s caller. */
export const listStudentRecordsFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { studentId } = parseParams(studentParamsSchema, ctx.params);
    const query = parseQuery(studentListQuerySchema, ctx.request);
    if (query.from && query.to && query.from > query.to) {
      throw new ValidationError("from must be on or before to", {
        code: "invalid_range",
      });
    }
    // Same rule as the POST: a student of this academy whom the caller may
    // see (a coach, another academy's student or a made-up id is 404).
    const visible =
      (await isStudentOfAcademy(db, academy.id, studentId)) &&
      (await canSeeStudent(db, member, studentId));
    if (!visible) {
      throw new NotFoundError("Student not found");
    }
    const where: Prisma.StudentRecordWhereInput = {
      academyId: academy.id,
      studentId,
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.template
        ? { data: { path: ["template"], equals: query.template } }
        : {}),
      ...(query.from || query.to ? { recordedOn: plainDateRange(query) } : {}),
    };
    const rows = await db.studentRecord.findMany({
      where: {
        AND: [where, timeIdKeysetWhere("recordedOn", query.cursor, "desc")],
      },
      orderBy: [{ recordedOn: "desc" }, { id: "desc" }],
      take: query.limit + 1,
      include: recordInclude,
    });
    return json(
      toPage(
        rows,
        query.limit,
        (row) => encodeTimeIdCursor(row.recordedOn, row.id),
        serializeRecord
      )
    );
  });

export const listStudentRecords = listStudentRecordsFor(recordReader);

const queueQuerySchema = z.object({
  ...paginationQueryShape,
  status: recordStatusSchema.default("pending"),
  recordType: recordTypeSchema.optional(),
  studentId: idSchema.optional(),
});

/** The students whose records `member` reviews; never themself. */
const reviewableStudentFilter = async (
  member: AcademyMember,
  studentId: string | undefined
): Promise<Prisma.StudentRecordWhereInput> => {
  if (member.seesWholeAcademy) {
    return {
      studentId:
        studentId === undefined
          ? { not: member.userId }
          : { equals: studentId, not: member.userId },
    };
  }
  const coached = (
    await getStudentIdsForCoach(db, member.academyId, member.userId)
  ).filter(
    (id) =>
      id !== member.userId && (studentId === undefined || id === studentId)
  );
  return { studentId: { in: coached } };
};

/** GET /records for `resolve`'s caller (the owner: every student's records). */
export const listRecordQueueFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const query = parseQuery(queueQuerySchema, ctx.request);
    const direction = query.status === "pending" ? "asc" : "desc";
    const where: Prisma.StudentRecordWhereInput = {
      academyId: academy.id,
      status: query.status,
      // CO-9: a reviewer's own uploads are not in their queue.
      recordedById: { not: member.userId },
      ...(query.recordType ? { recordType: query.recordType } : {}),
      ...(await reviewableStudentFilter(member, query.studentId)),
    };
    const rows = await db.studentRecord.findMany({
      where: {
        AND: [where, timeIdKeysetWhere("createdAt", query.cursor, direction)],
      },
      orderBy: [{ createdAt: direction }, { id: direction }],
      take: query.limit + 1,
      include: recordInclude,
    });
    return json(
      toPage(
        rows,
        query.limit,
        (row) => encodeTimeIdCursor(row.createdAt, row.id),
        serializeRecord
      )
    );
  });

export const listRecordQueue = listRecordQueueFor(
  academyAccessWith({ record: ["verify"] })
);

// ---------------------------------------------------------------- one record

/** GET /records/:id for `resolve`'s caller: the row plus a signed file URL. */
export const getRecordFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { id } = parseParams(recordParamsSchema, ctx.params);
    const row = await loadVisibleRecord(member, academy.id, id);
    let file: { url: string; expiresAt: string } | null = null;
    if (row.fileUrl) {
      const download = await requireStorage().createDownloadUrl({
        key: row.fileUrl,
        expiresInSeconds: DOWNLOAD_URL_SECONDS,
      });
      file = { url: download.url, expiresAt: toTimestamp(download.expiresAt) };
    }
    return json({ data: { ...serializeRecord(row), file } });
  });

export const getRecord = getRecordFor(recordReader);

const updateBodySchema = z
  .object({
    recordedOn: isoDateSchema.optional(),
    schemaVersion: schemaVersionSchema.optional(),
    data: recordDataSchema.optional(),
    fileKey: fileKeySchema.nullable().optional(),
  })
  .refine((body) => Object.values(body).some((value) => value !== undefined), {
    message: "Send at least one field to change",
  });

export const updateRecord = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    record: ["create"],
  });
  const { id } = parseParams(recordParamsSchema, ctx.params);
  const input = parseBody(updateBodySchema, await readJsonBody(ctx.request));
  const before = await loadVisibleRecord(member, academy.id, id);
  if (before.recordedById !== session.user.id) {
    throw new ForbiddenError("Only whoever recorded it can edit a record", {
      code: "not_recorder",
    });
  }
  // Academy admins delete a wrong pending record instead of editing it.
  if (!(member.isCoach || member.isStudent)) {
    throw new ForbiddenError(
      "Academy admins can delete a pending record but not edit it",
      { code: "admin_delete_only" }
    );
  }
  if (before.status !== "pending") {
    throw notPending();
  }

  const changes: Prisma.StudentRecordUpdateManyMutationInput = {};
  if (input.data !== undefined || input.schemaVersion !== undefined) {
    const schemaVersion = input.schemaVersion ?? before.schemaVersion;
    changes.schemaVersion = schemaVersion;
    changes.data = validateRecordData(
      before.recordType,
      schemaVersion,
      input.data ?? before.data
    );
  }
  if (input.recordedOn !== undefined) {
    assertNotInFuture(input.recordedOn, academy.timezone);
    changes.recordedOn = fromPlainDate(input.recordedOn);
  }
  let file: AttachedFile | null = null;
  if (typeof input.fileKey === "string") {
    file = await attachUpload(input.fileKey, {
      academyId: academy.id,
      uploaderId: session.user.id,
      studentId: before.studentId,
    });
    changes.fileUrl = file.permanentKey;
  } else if (input.fileKey === null) {
    changes.fileUrl = null;
  }

  let updated: { count: number };
  try {
    // Conditional on pending: a review that lands first wins.
    updated = await db.studentRecord.updateMany({
      where: { id, academyId: academy.id, status: "pending" },
      data: changes,
    });
  } catch (error) {
    await deleteObjectsQuietly([file?.permanentKey]);
    throw error;
  }
  if (updated.count === 0) {
    await deleteObjectsQuietly([file?.permanentKey]);
    throw notPending();
  }
  const fileReplaced = input.fileKey !== undefined;
  await deleteObjectsQuietly([
    file?.tmpKey,
    fileReplaced ? before.fileUrl : null,
  ]);
  const after = await db.studentRecord.findUniqueOrThrow({
    where: { id },
    include: recordInclude,
  });
  return json({ data: serializeRecord(after) });
});

export const deleteRecord = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    record: ["create"],
  });
  const { id } = parseParams(recordParamsSchema, ctx.params);
  const row = await loadVisibleRecord(member, academy.id, id);
  if (row.recordedById !== session.user.id && !member.isAdmin) {
    throw new ForbiddenError(
      "Only whoever recorded it or an academy admin can delete a record",
      { code: "not_recorder" }
    );
  }
  if (row.status !== "pending") {
    throw notPending();
  }
  const deleted = await db.studentRecord.deleteMany({
    where: { id, academyId: academy.id, status: "pending" },
  });
  if (deleted.count === 0) {
    throw notPending();
  }
  await deleteObjectsQuietly([row.fileUrl]);
  return noContent();
});

// ---------------------------------------------------------------- review

const verifyBodySchema = z.object({});
const rejectBodySchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
});

const review = async (
  ctx: ApiContext,
  access: AcademyAccess,
  decision: { status: "verified" | "rejected"; reason: string | null }
): Promise<Response> => {
  const { session, member, academy } = access;
  const { id } = parseParams(recordParamsSchema, ctx.params);
  const before = await loadVisibleRecord(member, academy.id, id);
  // A coach who is also a student can see their own records; never review them.
  if (
    before.recordedById === session.user.id ||
    before.studentId === session.user.id
  ) {
    throw new ForbiddenError(
      "You cannot review a record you recorded or one about yourself",
      { code: "cannot_review_own_record" }
    );
  }
  if (before.status !== "pending") {
    throw notPending();
  }
  const after = await db.$transaction(async (tx) => {
    const updated = await tx.studentRecord.updateMany({
      where: { id, academyId: academy.id, status: "pending" },
      data: {
        status: decision.status,
        verifiedById: session.user.id,
        reviewNote: decision.reason,
      },
    });
    if (updated.count === 0) {
      throw notPending();
    }
    const row = await tx.studentRecord.findUniqueOrThrow({
      where: { id },
      include: recordInclude,
    });
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action:
        decision.status === "verified" ? "record.verify" : "record.reject",
      entityType: "student_record",
      entityId: id,
      before: toAuditSnapshot(before),
      after: toAuditSnapshot(row),
      reason: decision.reason,
    });
    return row;
  });
  return json({ data: serializeRecord(after) });
};

export const verifyRecord = apiHandler(async (ctx) => {
  const access = await requireAcademyAccess(ctx, { record: ["verify"] });
  parseBody(verifyBodySchema, await readJsonBody(ctx.request));
  return await review(ctx, access, { status: "verified", reason: null });
});

export const rejectRecord = apiHandler(async (ctx) => {
  const access = await requireAcademyAccess(ctx, { record: ["verify"] });
  const input = parseBody(rejectBodySchema, await readJsonBody(ctx.request));
  return await review(ctx, access, {
    status: "rejected",
    reason: input.reason,
  });
});
