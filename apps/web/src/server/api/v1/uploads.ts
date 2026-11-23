/**
 * Uploads: a signed URL to put a record file straight into the private
 * bucket.
 *
 * POST /api/v1/academies/:academyId/uploads   anyone who may create a record
 *                                             (record:create)
 *
 * Body `{ fileName, contentType, size }`: PDF, JPEG or PNG, at most 10 MB.
 * `fileName` is checked but not kept: the key is made by the server,
 * `tmp/<academyId>/<uploaderId>/<uuid>.<ext>`, never taken from the client.
 *
 * 201 `{ data: { fileKey, uploadUrl, method: "PUT", headers, expiresAt,
 * maxBytes } }`. The client PUTs the file to `uploadUrl` with exactly
 * `headers` (its content type) within 10 minutes; the declared size is
 * signed, so a different size is refused by the bucket. Then it sends
 * `fileKey` with POST /students/:studentId/records or PATCH /records/:id.
 * Files never attached are deleted by the bucket's 24-hour `tmp/` rule.
 *
 * 503 `storage_not_configured` when the server has no storage.
 */
import { z } from "zod";

import { requireAcademyAccess } from "../access";
import { apiHandler, created } from "../handler";
import { toTimestamp } from "../serialize";
import {
  createTmpKey,
  MAX_UPLOAD_BYTES,
  requireStorage,
  UPLOAD_CONTENT_TYPES,
  UPLOAD_URL_SECONDS,
  type UploadContentType,
} from "../storage/storage";
import { parseBody, readJsonBody } from "../validation";

const MAX_FILE_NAME_LENGTH = 255;
const LAST_CONTROL_CHARACTER = 0x1f;
const DELETE_CHARACTER = 0x7f;

const hasControlCharacters = (value: string): boolean =>
  [...value].some((char) => {
    const code = char.charCodeAt(0);
    return code <= LAST_CONTROL_CHARACTER || code === DELETE_CHARACTER;
  });

const contentTypes = Object.keys(UPLOAD_CONTENT_TYPES) as [
  UploadContentType,
  ...UploadContentType[],
];

const bodySchema = z.object({
  fileName: z
    .string()
    .trim()
    .min(1)
    .max(MAX_FILE_NAME_LENGTH)
    .refine((value) => !hasControlCharacters(value), "Invalid file name"),
  contentType: z.enum(contentTypes, {
    error: "Only PDF, JPEG and PNG files are accepted",
  }),
  size: z
    .int()
    .min(1)
    .max(MAX_UPLOAD_BYTES, { error: "Files can be at most 10 MB" }),
});

export const createUpload = apiHandler(async (ctx) => {
  const { session, academy } = await requireAcademyAccess(ctx, {
    record: ["create"],
  });
  const input = parseBody(bodySchema, await readJsonBody(ctx.request));
  const storage = requireStorage();
  const fileKey = createTmpKey(academy.id, session.user.id, input.contentType);
  const upload = await storage.createUploadUrl({
    key: fileKey,
    contentType: input.contentType,
    contentLength: input.size,
    expiresInSeconds: UPLOAD_URL_SECONDS,
  });
  return created({
    data: {
      fileKey,
      uploadUrl: upload.url,
      method: upload.method,
      headers: upload.headers,
      expiresAt: toTimestamp(upload.expiresAt),
      maxBytes: MAX_UPLOAD_BYTES,
    },
  });
});
