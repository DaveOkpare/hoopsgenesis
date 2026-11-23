/**
 * The built-in `generic` payment provider: for a gateway you control (or a
 * small relay in front of a real one) that signs its webhooks with a shared
 * secret.
 *
 * Request:
 *   POST /api/v1/webhooks/payments/generic
 *   content-type: application/json
 *   x-webhook-timestamp: <unix time in seconds>
 *   x-webhook-signature: <hex HMAC-SHA256 of `${timestamp}.${rawBody}` with the secret>
 *
 * The timestamp must be within 5 minutes of the server clock, which limits
 * replays of a captured request (and retries are harmless anyway: the fee is
 * upserted on its reference).
 *
 * Body:
 *   {
 *     "type": "payment.succeeded",          // anything else is acknowledged and ignored
 *     "data": {
 *       "reference": "txn_123",             // unique per payment
 *       "amount": "15000.00",               // decimal string
 *       "currency": "NGN",
 *       "paidAt": "2026-11-23T08:30:00Z",
 *       "paymentMethod": "card",            // optional, defaults to "generic"
 *       "metadata": {
 *         "academyId": "...",
 *         "studentId": "...",
 *         "periodStart": "2026-11-01",
 *         "periodEnd": "2026-11-30",
 *         "description": "Nov 2026 tuition" // optional
 *       }
 *     }
 *   }
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { ValidationError } from "../../errors";
import {
  currencySchema,
  idSchema,
  isoDateSchema,
  moneyAmountSchema,
  timestampSchema,
} from "../../validation";
import type {
  ParseResult,
  PaymentProvider,
  PaymentWebhookRequest,
  VerifyResult,
} from "./provider";

export const GENERIC_PROVIDER_NAME = "generic";
export const GENERIC_SIGNATURE_HEADER = "x-webhook-signature";
export const GENERIC_TIMESTAMP_HEADER = "x-webhook-timestamp";
export const GENERIC_PAYMENT_EVENT = "payment.succeeded";
/** How far the signed timestamp may be from the server clock, either way. */
export const GENERIC_TOLERANCE_SECONDS = 300;

const MS_PER_SECOND = 1000;
const TIMESTAMP_PATTERN = /^\d{1,12}$/;
const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/i;
const MAX_TEXT_LENGTH = 255;
const MAX_DESCRIPTION_LENGTH = 500;

const text = (max = MAX_TEXT_LENGTH) => z.string().trim().min(1).max(max);

const eventSchema = z.object({
  type: text(),
  data: z.unknown().optional(),
});

const paymentDataSchema = z.object({
  reference: text(),
  amount: moneyAmountSchema,
  currency: currencySchema,
  paidAt: timestampSchema,
  paymentMethod: text(64).optional(),
  metadata: z.object({
    academyId: idSchema,
    studentId: idSchema,
    periodStart: isoDateSchema,
    periodEnd: isoDateSchema,
    description: text(MAX_DESCRIPTION_LENGTH).optional(),
  }),
});

/** The signature the generic provider expects; exported for tests and senders. */
export const signGenericPayload = (
  secret: string,
  timestamp: string,
  rawBody: string
): string =>
  createHmac("sha256", secret).update(`${timestamp}.${rawBody}`).digest("hex");

const invalid = (message: string): VerifyResult => ({
  ok: false,
  code: "invalid_signature",
  message,
});

const verifyGeneric = (
  secret: string,
  { headers, rawBody }: PaymentWebhookRequest,
  now: Date
): VerifyResult => {
  const timestamp = headers.get(GENERIC_TIMESTAMP_HEADER)?.trim() ?? "";
  const signature = headers.get(GENERIC_SIGNATURE_HEADER)?.trim() ?? "";
  if (
    !(TIMESTAMP_PATTERN.test(timestamp) && SHA256_HEX_PATTERN.test(signature))
  ) {
    return invalid("Missing or malformed signature headers");
  }
  const expected = Buffer.from(
    signGenericPayload(secret, timestamp, rawBody),
    "hex"
  );
  const given = Buffer.from(signature, "hex");
  // Both are 32 bytes (checked by the pattern), so timingSafeEqual cannot throw.
  if (!timingSafeEqual(expected, given)) {
    return invalid("Signature does not match");
  }
  // The timestamp is part of what is signed, so check it only once the
  // signature holds: unsigned junk is always "invalid_signature".
  const skewSeconds = Math.abs(
    now.getTime() / MS_PER_SECOND - Number(timestamp)
  );
  if (skewSeconds > GENERIC_TOLERANCE_SECONDS) {
    return {
      ok: false,
      code: "stale_timestamp",
      message: "Webhook timestamp is too far from the server clock",
    };
  }
  return { ok: true };
};

const parseGeneric = ({ rawBody }: PaymentWebhookRequest): ParseResult => {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch (error) {
    throw new ValidationError("Request body is not valid JSON", {
      code: "invalid_json",
      cause: error,
    });
  }
  const event = eventSchema.parse(json);
  if (event.type !== GENERIC_PAYMENT_EVENT) {
    return {
      kind: "ignored",
      reason: `Event type ${event.type} is not handled`,
    };
  }
  const data = paymentDataSchema.parse(event.data);
  const { metadata } = data;
  return {
    kind: "payment",
    payment: {
      paymentReference: data.reference,
      academyId: metadata.academyId,
      studentId: metadata.studentId,
      periodStart: metadata.periodStart,
      periodEnd: metadata.periodEnd,
      amount: data.amount,
      currency: data.currency,
      paidAt: data.paidAt,
      description:
        metadata.description ??
        `Fee for ${metadata.periodStart} to ${metadata.periodEnd}`,
      paymentMethod: data.paymentMethod ?? GENERIC_PROVIDER_NAME,
    },
  };
};

export const createGenericProvider = (secret: string): PaymentProvider => ({
  verify: (request, now) => verifyGeneric(secret, request, now),
  parse: parseGeneric,
});
