/**
 * The academy's printed QR code. One static code per academy; it proves
 * only "I am at this academy" (location does the rest, see ./scan.ts).
 *
 * GET  /api/v1/academies/:academyId/academy-qr             academy admin;
 *      `{ token, deepLink }` at the top level, as the API document shows
 * POST /api/v1/academies/:academyId/academy-qr/regenerate  academy admin; new qrNonce, audited;
 *      the same `{ token, deepLink }`
 *
 * Token: `hgqr1.<base64url(academyId)>.<base64url(HMAC-SHA256)>`. The HMAC
 * covers the academy id and its current `qrNonce`, with a key derived from
 * BETTER_AUTH_SECRET (HKDF, fixed context label), so no new secret is
 * needed. The nonce is not in the token: the server looks it up, so a
 * regenerated nonce invalidates every old print.
 *
 * Deep link: `hoops-genesis://check-in?code=<token>` (the native app's
 * scheme). The scan endpoint accepts either the bare token or the link.
 */
import {
  createHash,
  createHmac,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { ENV } from "../../../env.server";
import { db } from "../../../services";
import { requireAcademyAccess } from "../access";
import { writeAuditLog } from "../audit";
import { NotFoundError } from "../errors";
import { apiHandler, json } from "../handler";

const TOKEN_PREFIX = "hgqr1";
const KEY_CONTEXT = "hoops-genesis/academy-qr/v1";
const KEY_BYTES = 32;
const NONCE_BYTES = 32;
const MAX_TOKEN_LENGTH = 512;
const FINGERPRINT_LENGTH = 12;
const TOKEN_PARTS = 3;
export const DEEP_LINK_BASE = "hoops-genesis://check-in";
const DEEP_LINK_PARAM = "code";

/** Academy admin only: the same right as editing the academy itself. */
const QR_PERMISSIONS = { organization: ["update"] } as const;

let cachedKey: Buffer | undefined;

/** HKDF-SHA256(BETTER_AUTH_SECRET, info = KEY_CONTEXT): a key used only here. */
const qrKey = (): Buffer => {
  cachedKey ??= Buffer.from(
    hkdfSync("sha256", ENV.BETTER_AUTH_SECRET, "", KEY_CONTEXT, KEY_BYTES)
  );
  return cachedKey;
};

const sign = (academyId: string, qrNonce: string): Buffer =>
  createHmac("sha256", qrKey())
    .update(JSON.stringify([academyId, qrNonce]))
    .digest();

export const createAcademyQrToken = (
  academyId: string,
  qrNonce: string
): string =>
  [
    TOKEN_PREFIX,
    Buffer.from(academyId, "utf8").toString("base64url"),
    sign(academyId, qrNonce).toString("base64url"),
  ].join(".");

export const toDeepLink = (token: string): string =>
  `${DEEP_LINK_BASE}?${DEEP_LINK_PARAM}=${encodeURIComponent(token)}`;

export interface ParsedQrToken {
  academyId: string;
  signature: Buffer;
}

/** The token itself, or the `code` of a scanned deep link. */
const unwrapDeepLink = (value: string): string => {
  if (!value.startsWith(DEEP_LINK_BASE)) {
    return value;
  }
  try {
    return new URL(value).searchParams.get(DEEP_LINK_PARAM) ?? "";
  } catch {
    return "";
  }
};

/** Reads a token's academy id and signature; null if it is not well formed. */
export const parseAcademyQrToken = (value: string): ParsedQrToken | null => {
  const token = unwrapDeepLink(value.trim());
  if (token.length === 0 || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  const parts = token.split(".");
  if (parts.length !== TOKEN_PARTS || parts[0] !== TOKEN_PREFIX) {
    return null;
  }
  const academyId = Buffer.from(parts[1] ?? "", "base64url").toString("utf8");
  const signature = Buffer.from(parts[2] ?? "", "base64url");
  if (academyId.length === 0) {
    return null;
  }
  return { academyId, signature };
};

/** Constant-time check of a parsed token against the academy's current nonce. */
export const isAcademyQrSignatureValid = (
  parsed: ParsedQrToken,
  qrNonce: string
): boolean => {
  const expected = sign(parsed.academyId, qrNonce);
  return (
    parsed.signature.length === expected.length &&
    timingSafeEqual(parsed.signature, expected)
  );
};

/** A short, non-reversible label of a nonce for audit rows (never the nonce). */
const nonceFingerprint = (qrNonce: string): string =>
  createHash("sha256")
    .update(qrNonce)
    .digest("hex")
    .slice(0, FINGERPRINT_LENGTH);

const qrCode = (academyId: string, qrNonce: string) => {
  const token = createAcademyQrToken(academyId, qrNonce);
  return { token, deepLink: toDeepLink(token) };
};

export const getAcademyQr = apiHandler(async (ctx) => {
  const { academy } = await requireAcademyAccess(ctx, QR_PERMISSIONS);
  const row = await db.organization.findUnique({
    where: { id: academy.id },
    select: { qrNonce: true },
  });
  if (!row) {
    throw new NotFoundError("Academy not found");
  }
  return json(qrCode(academy.id, row.qrNonce));
});

/**
 * Better Auth marks qrNonce `input: false`, so it cannot change through
 * organization.update; write it with Prisma directly.
 */
export const regenerateAcademyQr = apiHandler(async (ctx) => {
  const { session, academy } = await requireAcademyAccess(ctx, QR_PERMISSIONS);
  const qrNonce = await db.$transaction(async (tx) => {
    const before = await tx.organization.findUniqueOrThrow({
      where: { id: academy.id },
      select: { qrNonce: true },
    });
    const next = randomBytes(NONCE_BYTES).toString("base64url");
    await tx.organization.update({
      where: { id: academy.id },
      data: { qrNonce: next },
    });
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action: "academy_qr.regenerate",
      entityType: "organization",
      entityId: academy.id,
      before: { qrNonceFingerprint: nonceFingerprint(before.qrNonce) },
      after: { qrNonceFingerprint: nonceFingerprint(next) },
    });
    return next;
  });
  return json(qrCode(academy.id, qrNonce));
});
