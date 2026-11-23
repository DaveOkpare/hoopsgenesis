/**
 * Shared pieces of the student record endpoints (./records.ts): the row
 * shape and its serializers, `data` validation against the template
 * registry, and attaching an uploaded file.
 */
import type { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  findRecordTemplate,
  RECORD_TEMPLATES,
  type RecordType,
} from "../config/record-templates";
import {
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from "../errors";
import { formatZodIssues } from "../handler";
import type { AcademyMember } from "../roles";
import { canSeeStudent } from "../scope";
import { toPlainDate, toTimestamp } from "../serialize";
import { StorageObjectNotFoundError } from "../storage/object-storage";
import {
  createRecordFileKey,
  getStorage,
  parseTmpKey,
  requireStorage,
} from "../storage/storage";
import { todayInTimeZone } from "../time";

const MAX_FILE_KEY_LENGTH = 512;
const MAX_SCHEMA_VERSION = 1000;
const MAX_TEMPLATE_KEY_LENGTH = 64;

export const recordTypeSchema = z.enum(["academic", "athletic"]);
export const recordStatusSchema = z.enum(["pending", "verified", "rejected"]);
export const schemaVersionSchema = z.int().min(1).max(MAX_SCHEMA_VERSION);
export const templateKeySchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_TEMPLATE_KEY_LENGTH);
/** Any JSON object; checked against its template by `validateRecordData`. */
export const recordDataSchema = z.record(z.string(), z.unknown());
export const fileKeySchema = z.string().trim().min(1).max(MAX_FILE_KEY_LENGTH);

const personSelect = { select: { id: true, name: true } } as const;

export const recordInclude = {
  student: personSelect,
  recordedBy: personSelect,
  verifiedBy: personSelect,
} satisfies Prisma.StudentRecordInclude;

export type RecordRow = Prisma.StudentRecordGetPayload<{
  include: typeof recordInclude;
}>;

type PlainRecordRow = Prisma.StudentRecordModel;

const templateOf = (data: unknown): string | null => {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const { template } = data as { template?: unknown };
    return typeof template === "string" ? template : null;
  }
  return null;
};

/**
 * The API form of a record. Never includes `file_url` (the storage key):
 * `hasFile` says whether there is one, and GET /records/:id signs a URL.
 */
export const serializeRecord = (row: RecordRow) => ({
  id: row.id,
  academyId: row.academyId,
  studentId: row.studentId,
  student: row.student,
  recordType: row.recordType,
  template: templateOf(row.data),
  schemaVersion: row.schemaVersion,
  recordedOn: toPlainDate(row.recordedOn),
  data: row.data,
  status: row.status,
  recordedById: row.recordedById,
  recordedBy: row.recordedBy,
  verifiedById: row.verifiedById,
  verifiedBy: row.verifiedBy,
  reviewNote: row.reviewNote,
  hasFile: row.fileUrl !== null,
  createdAt: toTimestamp(row.createdAt),
});

/** What goes into audit_log: the row without its storage key. */
export const toAuditSnapshot = (row: PlainRecordRow) => ({
  id: row.id,
  academyId: row.academyId,
  studentId: row.studentId,
  recordType: row.recordType,
  recordedById: row.recordedById,
  recordedOn: toPlainDate(row.recordedOn),
  schemaVersion: row.schemaVersion,
  data: row.data,
  status: row.status,
  verifiedById: row.verifiedById,
  reviewNote: row.reviewNote,
  hasFile: row.fileUrl !== null,
  createdAt: toTimestamp(row.createdAt),
});

/**
 * Validates `data` against the template named by `data.template` for this
 * record type and schema version. Returns the parsed (trimmed) data.
 *
 * 400 `unknown_template`: no such template for the record type.
 * 400 `unknown_schema_version`: the template exists, not in that version.
 * 400 `invalid_record_data`: the fields do not match (issues under `data.`).
 */
export const validateRecordData = (
  recordType: RecordType,
  schemaVersion: number,
  data: unknown
): Prisma.InputJsonObject => {
  const parsedKey = templateKeySchema.safeParse(templateOf(data));
  if (!parsedKey.success) {
    throw new ValidationError("data.template must name a record template", {
      code: "unknown_template",
      details: { path: "data.template" },
    });
  }
  const key = parsedKey.data;
  const template = findRecordTemplate(recordType, key, schemaVersion);
  if (!template) {
    const versions = RECORD_TEMPLATES.filter(
      (entry) => entry.recordType === recordType && entry.key === key
    ).map((entry) => entry.schemaVersion);
    if (versions.length > 0) {
      throw new ValidationError(
        `Template ${key} has no schema version ${schemaVersion}`,
        {
          code: "unknown_schema_version",
          details: { template: key, schemaVersion, versions },
        }
      );
    }
    throw new ValidationError(`No ${recordType} template named ${key}`, {
      code: "unknown_template",
      details: { recordType, template: key },
    });
  }
  const result = template.schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError("data does not match the template", {
      code: "invalid_record_data",
      details: {
        template: key,
        schemaVersion,
        issues: formatZodIssues(result.error).map((issue) => ({
          ...issue,
          path: issue.path ? `data.${issue.path}` : "data",
        })),
      },
    });
  }
  return result.data as Prisma.InputJsonObject;
};

/** 422 `recorded_on_in_future` for a date after today in the academy. */
export const assertNotInFuture = (recordedOn: string, timeZone: string) => {
  if (recordedOn > todayInTimeZone(timeZone)) {
    throw new RuleViolationError("recordedOn cannot be in the future", {
      code: "recorded_on_in_future",
    });
  }
};

/** A record in this academy that `member` may see, else 404. */
export const loadVisibleRecord = async (
  member: AcademyMember,
  academyId: string,
  id: string
): Promise<RecordRow> => {
  const row = await db.studentRecord.findFirst({
    where: { id, academyId },
    include: recordInclude,
  });
  if (!(row && (await canSeeStudent(db, member, row.studentId)))) {
    throw new NotFoundError("Record not found");
  }
  return row;
};

export interface AttachedFile {
  /** The permanent key, stored in file_url. */
  permanentKey: string;
  /** The upload, deleted once the record is saved. */
  tmpKey: string;
}

/**
 * Copies an upload from `tmp/` to its permanent key. The key must be one
 * POST /uploads made for this academy and this uploader.
 *
 * 400 `invalid_file_key`, 403 `file_not_owned`, 503 `storage_not_configured`,
 * 422 `file_not_uploaded` (nothing at the key: not uploaded, or expired).
 */
export const attachUpload = async (
  fileKey: string,
  owner: { academyId: string; uploaderId: string; studentId: string }
): Promise<AttachedFile> => {
  const parsed = parseTmpKey(fileKey);
  if (!parsed) {
    throw new ValidationError("fileKey is not an upload key", {
      code: "invalid_file_key",
    });
  }
  if (
    parsed.academyId !== owner.academyId ||
    parsed.uploaderId !== owner.uploaderId
  ) {
    throw new ForbiddenError("This upload belongs to someone else", {
      code: "file_not_owned",
    });
  }
  const storage = requireStorage();
  const permanentKey = createRecordFileKey(
    owner.academyId,
    owner.studentId,
    parsed.extension
  );
  try {
    await storage.copyObject(fileKey, permanentKey);
  } catch (error) {
    if (error instanceof StorageObjectNotFoundError) {
      throw new RuleViolationError(
        "No file at this key: upload it first, or ask for a new upload URL",
        { code: "file_not_uploaded", cause: error }
      );
    }
    throw error;
  }
  return { permanentKey, tmpKey: fileKey };
};

/**
 * Deletes objects that are no longer referenced. Best effort: a failure
 * leaves an unreferenced private object (tmp/ ones expire on their own), so
 * it never fails the request, and keys are never logged.
 */
export const deleteObjectsQuietly = async (
  keys: readonly (string | null | undefined)[]
): Promise<void> => {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  await Promise.all(
    keys
      .filter((key): key is string => typeof key === "string")
      .map(async (key) => {
        try {
          await storage.deleteObject(key);
        } catch {
          // Unreferenced and private; see above.
        }
      })
  );
};
