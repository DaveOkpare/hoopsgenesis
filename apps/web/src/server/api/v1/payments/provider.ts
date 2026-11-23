/**
 * The contract every payment provider implements for
 * POST /api/v1/webhooks/payments/:provider (see ../payment-webhook.ts).
 *
 * A provider does two things, both pure (no database):
 * 1. `verify`: is this request really from the provider? Works on the raw
 *    body bytes, before any JSON parsing.
 * 2. `parse`: turn the provider's payload into a `PaymentEvent`, or say the
 *    event is not a completed payment and should be acknowledged and ignored.
 *
 * The webhook handler does everything else: it checks the academy and the
 * student, upserts on `paymentReference`, and writes the audit row.
 *
 * To add a provider: write a `create<Name>Provider(secret)` in this folder
 * that returns a `PaymentProvider`, and register it in ./registry.ts with
 * its secret's environment variable.
 */

export interface PaymentWebhookRequest {
  headers: Headers;
  /** The exact bytes the provider signed, decoded as UTF-8. */
  rawBody: string;
}

export type VerifyResult =
  | { ok: true }
  | {
      ok: false;
      code: "invalid_signature" | "stale_timestamp";
      message: string;
    };

/** A completed payment, in the provider-neutral form the handler records. */
export interface ParsedPayment {
  academyId: string;
  /** Decimal string, e.g. "15000.00". Never a JS number. */
  amount: string;
  /** ISO 4217, upper case. */
  currency: string;
  description: string;
  paidAt: Date;
  paymentMethod: string;
  /** The provider's transaction id; unique across all fees. */
  paymentReference: string;
  /** YYYY-MM-DD */
  periodEnd: string;
  /** YYYY-MM-DD */
  periodStart: string;
  studentId: string;
}

export type ParseResult =
  | { kind: "payment"; payment: ParsedPayment }
  /** Signed and well-formed, but not a completed payment (e.g. a refund). */
  | { kind: "ignored"; reason: string };

export interface PaymentProvider {
  /** Throws a ZodError or ValidationError (400) for a malformed payload. */
  parse: (request: PaymentWebhookRequest) => ParseResult;
  verify: (request: PaymentWebhookRequest, now: Date) => VerifyResult;
}

/** Looks a provider up by its path name; undefined = 404. */
export type PaymentProviderRegistry = (
  name: string
) => PaymentProvider | undefined;
