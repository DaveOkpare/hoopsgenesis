/**
 * POST /api/v1/webhooks/payments/:provider
 *
 * Not session-authenticated: the provider's signature is the authentication.
 *
 * 1. Unknown provider, or its secret is not configured   -> 404
 * 2. Read the raw body; verify the signature             -> 401 (invalid_signature, stale_timestamp)
 * 3. Parse the payload (provider-specific)               -> 400; non-payment events -> 200 ignored
 * 4. The student must be a student member of the academy named in the
 *    payment's metadata (ids from the payload are never trusted alone) -> 422
 * 5. Upsert on paymentReference: a known reference returns the existing fee
 *    (200, `replayed: true`) and writes nothing; a new one creates the fee
 *    (201) with recorded_by NULL and an audit row with a NULL actor.
 *
 * A paid live fee already covering the same period (say an academy admin recorded
 * cash) is a 409 `fee_period_exists`: the money arrived twice and someone has
 * to refund it, so it must not be dropped silently.
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import { writeAuditLog } from "../audit";
import {
  ConflictError,
  NotFoundError,
  RuleViolationError,
  UnauthorizedError,
  ValidationError,
} from "../errors";
import { type ApiHandler, apiHandler, created, json } from "../handler";
import { isStudentOfAcademy } from "../scope";
import { fromPlainDate } from "../serialize";
import { todayInTimeZone } from "../time";
import {
  findLiveFeeForPeriod,
  isUniqueViolation,
  periodTakenError,
  serializeFeeRow,
} from "./fees-core";
import type {
  ParsedPayment,
  PaymentProviderRegistry,
} from "./payments/provider";
import { defaultPaymentProviders } from "./payments/registry";

/** Same cap as readJsonBody. */
const MAX_BODY_BYTES = 1_000_000;
const MAX_PROVIDER_NAME_LENGTH = 64;
const PROVIDER_NAME_PATTERN = /^[a-z0-9-]+$/;

const paramsSchema = z.object({
  provider: z
    .string()
    .min(1)
    .max(MAX_PROVIDER_NAME_LENGTH)
    .regex(PROVIDER_NAME_PATTERN),
});

const readRawBody = async (request: Request): Promise<string> => {
  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    throw new ValidationError("Request body is too large", {
      code: "body_too_large",
    });
  }
  return raw;
};

const findFeeByReference = (paymentReference: string) =>
  db.fee.findUnique({ where: { paymentReference } });

type FeeRow = NonNullable<Awaited<ReturnType<typeof findFeeByReference>>>;

/** The stored fee for a reference we have seen before: same payment, or 409. */
const replayResponse = async (
  existing: FeeRow,
  payment: ParsedPayment,
  timezone: string
): Promise<Response> => {
  const samePayment =
    existing.academyId === payment.academyId &&
    existing.studentId === payment.studentId;
  if (!samePayment) {
    throw new ConflictError("This payment reference belongs to another fee", {
      code: "payment_reference_conflict",
    });
  }
  return json({
    data: await serializeFeeRow(db, existing, todayInTimeZone(timezone)),
    replayed: true,
  });
};

const recordPayment = async (
  request: Request,
  payment: ParsedPayment
): Promise<Response> => {
  if (payment.periodEnd < payment.periodStart) {
    throw new ValidationError("periodEnd must be on or after periodStart", {
      code: "invalid_period",
    });
  }
  // A student member row implies the academy exists.
  if (!(await isStudentOfAcademy(db, payment.academyId, payment.studentId))) {
    throw new RuleViolationError(
      "The student is not a student of this academy",
      { code: "student_not_in_academy" }
    );
  }
  const academy = await db.organization.findUniqueOrThrow({
    where: { id: payment.academyId },
    select: { id: true, timezone: true },
  });

  const existing = await findFeeByReference(payment.paymentReference);
  if (existing) {
    return await replayResponse(existing, payment, academy.timezone);
  }

  try {
    const fee = await db.$transaction(async (tx) => {
      const taken = await findLiveFeeForPeriod(tx, {
        academyId: academy.id,
        studentId: payment.studentId,
        periodStart: payment.periodStart,
      });
      if (taken) {
        throw periodTakenError(taken.id);
      }
      const row = await tx.fee.create({
        data: {
          academyId: academy.id,
          studentId: payment.studentId,
          description: payment.description,
          periodStart: fromPlainDate(payment.periodStart),
          periodEnd: fromPlainDate(payment.periodEnd),
          dueDate: fromPlainDate(payment.periodStart),
          amount: new Prisma.Decimal(payment.amount),
          currency: payment.currency,
          paidAt: payment.paidAt,
          paymentMethod: payment.paymentMethod,
          paymentReference: payment.paymentReference,
          recordedById: null,
        },
      });
      await writeAuditLog(tx, {
        request,
        session: null,
        academyId: academy.id,
        action: "fee.create",
        entityType: "fee",
        entityId: row.id,
        after: row,
      });
      return row;
    });
    return created({
      data: await serializeFeeRow(db, fee, todayInTimeZone(academy.timezone)),
      replayed: false,
    });
  } catch (error) {
    if (!isUniqueViolation(error)) {
      throw error;
    }
    // A concurrent delivery of the same event won the insert: replay it.
    const winner = await findFeeByReference(payment.paymentReference);
    if (winner) {
      return await replayResponse(winner, payment, academy.timezone);
    }
    // Otherwise a concurrent fee took the period.
    const taken = await findLiveFeeForPeriod(db, {
      academyId: academy.id,
      studentId: payment.studentId,
      periodStart: payment.periodStart,
    });
    if (taken) {
      throw periodTakenError(taken.id);
    }
    throw error;
  }
};

/** The webhook handler over a provider registry (tests inject their own). */
export const createPaymentWebhookHandler = (
  providers: PaymentProviderRegistry,
  clock: () => Date = () => new Date()
): ApiHandler =>
  apiHandler(
    async ({ request, params }) => {
      const parsedParams = paramsSchema.safeParse(params);
      const provider = parsedParams.success
        ? providers(parsedParams.data.provider)
        : undefined;
      if (!provider) {
        throw new NotFoundError("Unknown payment provider");
      }
      const webhookRequest = {
        headers: request.headers,
        rawBody: await readRawBody(request),
      };
      const verified = provider.verify(webhookRequest, clock());
      if (!verified.ok) {
        throw new UnauthorizedError(verified.message, { code: verified.code });
      }
      const event = provider.parse(webhookRequest);
      if (event.kind === "ignored") {
        return json({ data: { ignored: true, reason: event.reason } });
      }
      return recordPayment(request, event.payment);
      // Providers choose their own content type; the signature over the raw
      // body (not a session cookie) is what authenticates the call.
    },
    { anyContentType: true }
  );

export const handlePaymentWebhook = createPaymentWebhookHandler(
  defaultPaymentProviders
);
