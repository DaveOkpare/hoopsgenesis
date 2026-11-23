/**
 * File storage for record uploads, behind a small interface so the provider
 * can change (and tests can use ./memory-storage.ts).
 *
 * Files are personal data about minors:
 * - the bucket is private; clients only ever get short-lived signed URLs
 *   (`UPLOAD_URL_SECONDS`, `DOWNLOAD_URL_SECONDS`);
 * - the API never returns a storage key except the `tmp/` key a client just
 *   asked for, and nothing here logs keys or URLs.
 *
 * Key layout:
 * - `tmp/<academyId>/<uploaderId>/<uuid>.<ext>`: where clients upload. A
 *   bucket lifecycle rule deletes `tmp/` after 24 hours, which removes
 *   uploads that were never attached to a record.
 * - `academies/<academyId>/records/<studentId>/<uuid>.<ext>`: the permanent
 *   copy, made when a record is created or edited with the `fileKey`. Only
 *   this key is stored, in student_record.file_url.
 */
import { randomUUID } from "node:crypto";

import { ENV } from "../../../env.server";
import { ApiError } from "../errors";
import type { ObjectStorage } from "./object-storage";
import { createS3Storage, type S3StorageConfig } from "./s3";

/** A signed upload URL lives 10 minutes: long enough to start a phone upload. */
export const UPLOAD_URL_SECONDS = 600;
/** A signed download URL lives 5 minutes: open it now, ask again later. */
export const DOWNLOAD_URL_SECONDS = 300;
/** Largest upload accepted: 10 MB. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** Accepted upload types and the extension each gets in its key. */
export const UPLOAD_CONTENT_TYPES = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
} as const;

export type UploadContentType = keyof typeof UPLOAD_CONTENT_TYPES;

/** 503 when no storage is configured. */
export class StorageNotConfiguredError extends ApiError {
  constructor() {
    super(
      503,
      "storage_not_configured",
      "File storage is not set up for this server"
    );
  }
}

// undefined: read the environment; null: forced "not configured" (tests).
let override: ObjectStorage | null | undefined;
let fromEnv: ObjectStorage | null | undefined;

const readEnvConfig = (): S3StorageConfig | null => {
  const bucket = ENV.STORAGE_S3_BUCKET;
  const region = ENV.STORAGE_S3_REGION;
  const accessKeyId = ENV.STORAGE_S3_ACCESS_KEY_ID;
  const secretAccessKey = ENV.STORAGE_S3_SECRET_ACCESS_KEY;
  if (!(bucket && region && accessKeyId && secretAccessKey)) {
    return null;
  }
  return {
    endpoint: ENV.STORAGE_S3_ENDPOINT || `https://s3.${region}.amazonaws.com`,
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    forcePathStyle: ENV.STORAGE_S3_FORCE_PATH_STYLE === true,
  };
};

/** The configured storage, or null when the environment does not set one. */
export const getStorage = (): ObjectStorage | null => {
  if (override !== undefined) {
    return override;
  }
  if (fromEnv === undefined) {
    const config = readEnvConfig();
    fromEnv = config ? createS3Storage(config) : null;
  }
  return fromEnv;
};

/** The configured storage, else a 503 `storage_not_configured`. */
export const requireStorage = (): ObjectStorage => {
  const storage = getStorage();
  if (!storage) {
    throw new StorageNotConfiguredError();
  }
  return storage;
};

/** Tests: inject a fake (or null for "not configured"); undefined resets. */
export const setStorageForTesting = (
  storage: ObjectStorage | null | undefined
): void => {
  override = storage;
};

const KEY_SEGMENT = /^[A-Za-z0-9_-]{1,128}$/;
const UUID_FILE = /^[0-9a-f-]{36}\.(pdf|jpg|png)$/;
const TMP_PREFIX = "tmp";

const assertSegment = (value: string): string => {
  if (!KEY_SEGMENT.test(value)) {
    // Ids come from the database, so this is a server bug, not bad input.
    throw new Error("Id cannot be used in a storage key");
  }
  return value;
};

export const extensionFor = (contentType: UploadContentType): string =>
  UPLOAD_CONTENT_TYPES[contentType];

/** A fresh `tmp/` key for an upload by `uploaderId` in `academyId`. */
export const createTmpKey = (
  academyId: string,
  uploaderId: string,
  contentType: UploadContentType
): string =>
  [
    TMP_PREFIX,
    assertSegment(academyId),
    assertSegment(uploaderId),
    `${randomUUID()}.${extensionFor(contentType)}`,
  ].join("/");

export interface ParsedTmpKey {
  academyId: string;
  extension: string;
  uploaderId: string;
}

/** Splits a `tmp/` key made by `createTmpKey`; null if it is not one. */
export const parseTmpKey = (key: string): ParsedTmpKey | null => {
  const parts = key.split("/");
  const [prefix, academyId, uploaderId, file] = parts;
  if (
    parts.length !== 4 ||
    prefix !== TMP_PREFIX ||
    !academyId ||
    !uploaderId ||
    !file ||
    !KEY_SEGMENT.test(academyId) ||
    !KEY_SEGMENT.test(uploaderId) ||
    !UUID_FILE.test(file)
  ) {
    return null;
  }
  const extension = file.slice(file.lastIndexOf(".") + 1);
  return { academyId, uploaderId, extension };
};

/** A fresh permanent key for a record file about `studentId`. */
export const createRecordFileKey = (
  academyId: string,
  studentId: string,
  extension: string
): string =>
  [
    "academies",
    assertSegment(academyId),
    "records",
    assertSegment(studentId),
    `${randomUUID()}.${extension}`,
  ].join("/");
