/**
 * Writes audit_log rows. Always inside the transaction that makes the change,
 * so neither can exist without the other:
 *
 * ```ts
 * await db.$transaction(async (tx) => {
 *   const after = await tx.fee.update({ ... });
 *   await writeAuditLog(tx, {
 *     request, session, academyId, action: "fee.void",
 *     entityType: "fee", entityId: after.id, before, after, reason,
 *   });
 * });
 * ```
 *
 * audit_log is append-only (a database trigger rejects UPDATE, DELETE and
 * TRUNCATE), and its foreign keys block deleting the academy or the actor.
 *
 * Impersonation: when the platform owner acts as someone else (Better Auth
 * admin `impersonateUser`), the session's `impersonatedBy` is stored as
 * `impersonated_by`, so the row names both the account used (`actor_id`) and
 * who was really acting.
 */
import { createHmac, hkdfSync } from "node:crypto";

import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";

import { ENV } from "../../env.server";
import type { ApiSession } from "./access";

/** e.g. `fee.void`, `attendance.check_out`, `record.verify`, `team.member_add`. */
export type AuditAction = `${string}.${string}`;

export interface AuditEntry {
  /** null for platform-level actions. */
  academyId: string | null;
  action: AuditAction;
  /** The row after the change. */
  after?: unknown;
  /** The row before the change (any JSON-able value; Dates and Decimals ok). */
  before?: unknown;
  entityId: string;
  /** e.g. `fee`, `attendance`, `student_record`. */
  entityType: string;
  /** Required for voids (checked by the caller's schema). */
  reason?: string | null;
  /** For ip and user agent. */
  request: Request;
  /**
   * The actor; null for webhooks and system jobs. An impersonation session
   * also records its `impersonatedBy` user.
   */
  session: ApiSession | null;
}

const MAX_USER_AGENT_LENGTH = 512;
const FINGERPRINT_LENGTH = 12;

/**
 * A short, non-reversible label (first 12 hex digits of SHA-256) for a
 * secret an audit row must refer to: an invitation id, an invitation code.
 * Audit rows and logs never hold the secret itself.
 */
const FINGERPRINT_KEY_CONTEXT = "hoops-genesis/audit-fingerprint/v1";
const FINGERPRINT_KEY_BYTES = 32;
let fingerprintKey: Buffer | undefined;

/** HKDF-SHA256(BETTER_AUTH_SECRET, fixed label): a key used only for fingerprints. */
const getFingerprintKey = (): Buffer => {
  fingerprintKey ??= Buffer.from(
    hkdfSync(
      "sha256",
      ENV.BETTER_AUTH_SECRET,
      "",
      FINGERPRINT_KEY_CONTEXT,
      FINGERPRINT_KEY_BYTES
    )
  );
  return fingerprintKey;
};

/**
 * Keyed (HMAC), so someone who can read audit rows cannot test guesses of the
 * secret against the fingerprint without the server key.
 */
export const secretFingerprint = (secret: string): string =>
  createHmac("sha256", getFingerprintKey())
    .update(secret)
    .digest("hex")
    .slice(0, FINGERPRINT_LENGTH);

/**
 * The client's ip: the first `x-forwarded-for` hop (Vercel and most proxies
 * set it), else `x-real-ip`.
 */
export const getClientIp = (request: Request): string | null => {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0];
  const ip = forwarded?.trim() || request.headers.get("x-real-ip")?.trim();
  return ip || null;
};

/** JSON-safe copy: Dates become ISO strings, Decimals decimal strings. */
const toJsonColumn = (
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.DbNull => {
  if (value === undefined || value === null) {
    return Prisma.DbNull;
  }
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
};

export const writeAuditLog = async (
  tx: TransactionClient,
  entry: AuditEntry
): Promise<{ id: string }> =>
  tx.auditLog.create({
    data: {
      academyId: entry.academyId,
      actorId: entry.session?.user.id ?? null,
      impersonatedById: entry.session?.session.impersonatedBy ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      before: toJsonColumn(entry.before),
      after: toJsonColumn(entry.after),
      reason: entry.reason ?? null,
      ip: getClientIp(entry.request),
      userAgent:
        entry.request.headers
          .get("user-agent")
          ?.slice(0, MAX_USER_AGENT_LENGTH) ?? null,
    },
    select: { id: true },
  });
