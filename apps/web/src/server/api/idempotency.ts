/**
 * `Idempotency-Key` support for POSTs that create money or attendance rows.
 *
 * ```ts
 * const body = await readJsonBody(request);
 * const input = parseBody(schema, body);
 * return withIdempotency(
 *   { request, userId: session.user.id, body, required: true },
 *   async (tx) => {
 *     const row = await tx.fee.create({ ... });
 *     await writeAuditLog(tx, { ... }); // optional, same transaction
 *     return { status: 201, body: { data: serializeFee(row) } };
 *   }
 * );
 * ```
 *
 * - Same key + same body: the stored first result is returned again (with
 *   `idempotent-replayed: true`), and `work` does not run.
 * - Same key + different body: 409 `idempotency_key_reused`.
 * - Two requests at once: the key row is inserted first, inside the same
 *   transaction as `work`. The second insert waits on the unique index until
 *   the first transaction ends, then replays its result (or, if the first
 *   failed and rolled back, runs `work` itself).
 * - If `work` throws, everything rolls back and nothing is stored, so a retry
 *   runs again. Only successful results are replayed.
 * - Keys are scoped to user + method + path, so two users (or two endpoints)
 *   can use the same key safely.
 * - Keys are kept for IDEMPOTENCY_KEY_TTL_MS (48 hours): after a new key is
 *   stored, up to PURGE_BATCH_SIZE older keys are deleted, under a short
 *   statement timeout and skipping locked rows, so the purge can neither slow
 *   nor fail the request. A retry after 48 hours runs again.
 */
import { createHash } from "node:crypto";

import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";

import { db } from "../../services";
import { ConflictError, ValidationError } from "./errors";
import { json } from "./handler";

export const IDEMPOTENCY_HEADER = "idempotency-key";
export const IDEMPOTENT_REPLAY_HEADER = "idempotent-replayed";
const MAX_KEY_LENGTH = 255;
const HTTP_OK = 200;
/** Interactive transaction timeout, ms; covers waiting for a concurrent twin. */
const TRANSACTION_TIMEOUT_MS = 15_000;
/** How long a stored key (and its replayable result) is kept. */
export const IDEMPOTENCY_KEY_TTL_MS = 48 * 60 * 60 * 1000;
/** Most expired keys one request deletes. */
export const PURGE_BATCH_SIZE = 100;
/** The purge gives up (and deletes nothing) after this long. */
const PURGE_STATEMENT_TIMEOUT = "500ms";

export interface IdempotentResult {
  /** Already serialized (JSON-safe); stored and replayed as is. */
  body: unknown;
  status: number;
}

export interface IdempotencyOptions {
  /** The parsed JSON body, as read by `readJsonBody`. */
  body: unknown;
  request: Request;
  /** true: a missing header is a 400. false: without a key, just run once. */
  required: boolean;
  /** From the session, never from the body. */
  userId: string;
}

/** JSON with object keys sorted, so key order does not change the hash. */
const canonicalJson = (value: unknown): string => {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
};

export const hashRequestBody = (body: unknown): string =>
  createHash("sha256").update(canonicalJson(body)).digest("hex");

const readKey = (request: Request, required: boolean): string | undefined => {
  const key = request.headers.get(IDEMPOTENCY_HEADER)?.trim();
  if (!key) {
    if (required) {
      throw new ValidationError("The Idempotency-Key header is required", {
        code: "idempotency_key_required",
      });
    }
    return;
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new ValidationError(
      `Idempotency-Key must be at most ${MAX_KEY_LENGTH} characters`,
      { code: "idempotency_key_invalid" }
    );
  }
  return key;
};

const toResponse = (result: IdempotentResult, replayed: boolean): Response =>
  json(result.body, {
    status: result.status,
    headers: replayed ? { [IDEMPOTENT_REPLAY_HEADER]: "true" } : {},
  });

const toJsonInput = (
  value: unknown
): Prisma.InputJsonValue | typeof Prisma.JsonNull =>
  value === null || value === undefined
    ? Prisma.JsonNull
    : (value as Prisma.InputJsonValue);

/**
 * Deletes up to PURGE_BATCH_SIZE keys stored before `now` minus
 * IDEMPOTENCY_KEY_TTL_MS, oldest first, and returns how many. Best effort:
 * any error (including the statement timeout) is swallowed and gives 0.
 */
export const purgeExpiredIdempotencyKeys = async (
  now: Date = new Date()
): Promise<number> => {
  const cutoff = new Date(now.getTime() - IDEMPOTENCY_KEY_TTL_MS);
  try {
    const [, deleted] = await db.$transaction([
      db.$executeRawUnsafe(
        `SET LOCAL statement_timeout = '${PURGE_STATEMENT_TIMEOUT}'`
      ),
      db.$executeRaw`
        DELETE FROM idempotency_key
        WHERE id IN (
          SELECT id FROM idempotency_key
          WHERE created_at < ${cutoff}
          ORDER BY created_at
          LIMIT ${PURGE_BATCH_SIZE}
          FOR UPDATE SKIP LOCKED
        )
      `,
    ]);
    return deleted;
  } catch {
    // Old keys only cost space; the next request tries again.
    return 0;
  }
};

/**
 * Runs `work` in a transaction at most once per Idempotency-Key and returns
 * its result as a JSON response (see the file comment).
 */
export const withIdempotency = async (
  options: IdempotencyOptions,
  work: (tx: TransactionClient) => Promise<IdempotentResult>
): Promise<Response> => {
  const { request, userId, body, required } = options;
  const key = readKey(request, required);
  if (key === undefined) {
    const result = await db.$transaction(work, {
      timeout: TRANSACTION_TIMEOUT_MS,
    });
    return toResponse(result, false);
  }

  const scope = `${userId} ${request.method} ${new URL(request.url).pathname}`;
  const requestHash = hashRequestBody(body);
  const where = { key_scope: { key, scope } };

  const outcome = await db.$transaction(
    async (tx) => {
      // ON CONFLICT DO NOTHING: waits for a concurrent insert of the same
      // key to commit or roll back, then reports 0 rows if it committed.
      const { count } = await tx.idempotencyKey.createMany({
        data: [{ key, scope, requestHash }],
        skipDuplicates: true,
      });
      if (count === 0) {
        const stored = await tx.idempotencyKey.findUniqueOrThrow({ where });
        if (stored.requestHash !== requestHash) {
          throw new ConflictError(
            "This Idempotency-Key was already used for a different request",
            { code: "idempotency_key_reused" }
          );
        }
        return {
          replayed: true,
          result: {
            status: stored.responseStatus ?? HTTP_OK,
            body: stored.responseBody,
          },
        };
      }
      const result = await work(tx);
      await tx.idempotencyKey.update({
        where,
        data: {
          responseStatus: result.status,
          responseBody: toJsonInput(result.body),
        },
      });
      return { replayed: false, result };
    },
    { timeout: TRANSACTION_TIMEOUT_MS }
  );
  if (!outcome.replayed) {
    await purgeExpiredIdempotencyKeys();
  }
  return toResponse(outcome.result, outcome.replayed);
};
