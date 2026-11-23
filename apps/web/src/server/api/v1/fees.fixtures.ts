/**
 * Test helpers for the fee endpoints and the payment webhook. Test-only:
 * nothing in the app imports this file.
 */
import { randomUUID } from "node:crypto";

import { Prisma } from "@hoops-genesis/db/prisma";

import { db } from "../../../services";
import { fromPlainDate } from "../serialize";
import type { TestAcademy } from "../testing/fixtures";
import {
  GENERIC_SIGNATURE_HEADER,
  GENERIC_TIMESTAMP_HEADER,
  signGenericPayload,
} from "./payments/generic";

const MS_PER_SECOND = 1000;

export interface FeeItem {
  academyId: string;
  amount: string;
  currency: string;
  description: string;
  dueDate: string;
  id: string;
  paidAt: string | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  periodEnd: string;
  periodStart: string;
  recordedById: string | null;
  status: "paid" | "unpaid" | "overdue" | "voided";
  studentId: string;
  voidedAt: string | null;
  voidedById: string | null;
  voidReason: string | null;
}

export interface ErrorBody {
  error: { code: string; details?: Record<string, unknown>; message: string };
}

export const readJson = async <T>(response: Response): Promise<T> =>
  (await response.json()) as T;

/** A fee written straight to the database (e.g. an unpaid bill). */
export const insertFee = (
  academy: TestAcademy,
  studentId: string,
  fields: {
    periodStart: string;
    periodEnd: string;
    dueDate?: string;
    paidAt?: Date | null;
    amount?: string;
  }
) =>
  db.fee.create({
    data: {
      academyId: academy.id,
      studentId,
      description: `Test fee ${fields.periodStart}`,
      periodStart: fromPlainDate(fields.periodStart),
      periodEnd: fromPlainDate(fields.periodEnd),
      dueDate: fromPlainDate(fields.dueDate ?? fields.periodStart),
      amount: new Prisma.Decimal(fields.amount ?? "100.00"),
      currency: "NGN",
      paidAt: fields.paidAt ?? null,
    },
  });

/**
 * Deletes the fees of the given test academies (each test file makes its own
 * academies, so this never touches other rows). Run before `cleanup`, since
 * fee foreign keys block deleting their student.
 */
export const deleteTestFees = async (
  academies: readonly TestAcademy[]
): Promise<void> => {
  await db.fee.deleteMany({
    where: { academyId: { in: academies.map((academy) => academy.id) } },
  });
};

export const newIdempotencyKey = (): string => `test-${randomUUID()}`;

/** A generic-provider webhook request, signed with `secret` at `at`. */
export const genericWebhookRequest = (
  provider: string,
  body: unknown,
  options: { secret: string; at?: Date; signature?: string; rawBody?: string }
): Request => {
  const rawBody = options.rawBody ?? JSON.stringify(body);
  const timestamp = String(
    Math.floor((options.at ?? new Date()).getTime() / MS_PER_SECOND)
  );
  const signature =
    options.signature ??
    signGenericPayload(options.secret, timestamp, JSON.stringify(body));
  return new Request(
    `http://localhost:3001/api/v1/webhooks/payments/${provider}`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        [GENERIC_TIMESTAMP_HEADER]: timestamp,
        [GENERIC_SIGNATURE_HEADER]: signature,
      },
      body: rawBody,
    }
  );
};

/** A `payment.succeeded` event for the generic provider. */
export const genericPaymentEvent = (fields: {
  reference: string;
  academyId: string;
  studentId: string;
  periodStart: string;
  periodEnd: string;
  amount?: string;
  type?: string;
}) => ({
  type: fields.type ?? "payment.succeeded",
  data: {
    reference: fields.reference,
    amount: fields.amount ?? "15000.00",
    currency: "NGN",
    paidAt: "2026-11-20T09:15:00.000Z",
    paymentMethod: "card",
    metadata: {
      academyId: fields.academyId,
      studentId: fields.studentId,
      periodStart: fields.periodStart,
      periodEnd: fields.periodEnd,
      description: `Online fee ${fields.periodStart}`,
    },
  },
});
