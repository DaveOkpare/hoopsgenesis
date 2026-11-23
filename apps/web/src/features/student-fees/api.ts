/*
 * The student's own fees (ST-5), read-only. Data-layer convention: see
 * features/viewer/api.ts.
 */
import {
  addDays,
  addMonths,
  daysBetween,
  firstOfMonth,
  lastOfMonth,
  monthOf,
} from "@/features/student-calendar/dates";
import { isWholeMonth } from "@/features/student-fees/selectors";
import type { DateOnly, Id, Timestamp } from "@/features/types";
import { academyPath, apiData, apiRaw, type Page } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** The period the student has not paid for yet. */
export interface FeeDue {
  amount: string;
  currency: string;
  dueDate: DateOnly;
  /**
   * True when no fee was billed for the period, so the amount is taken from the
   * student's last payment (the server has no fee schedule). Shown as an estimate.
   */
  estimated: boolean;
  /** The billed (unpaid) fee row, for its detail page; null when estimated. */
  feeId: Id | null;
  periodEnd: DateOnly;
  periodStart: DateOnly;
}

/**
 * Where the student stands today:
 * - due: a period is unpaid (`due` says which and how much)
 * - paid_up: a payment covers today (`paidThrough` says until when)
 * - unknown: nothing covers today, nothing was billed and there is no payment to go
 *   by, so the app cannot say what is owed. Never shown as "all paid".
 */
export type FeeStanding = "due" | "paid_up" | "unknown";

export type MyFeeStatus = "paid" | "unpaid" | "overdue" | "voided";

/** One fee row as GET /api/v1/me/fees and GET /fees/:id return it. */
export interface MyFee {
  academyId: Id;
  amount: string;
  createdAt: Timestamp;
  currency: string;
  description: string;
  dueDate: DateOnly;
  id: Id;
  paidAt: Timestamp | null;
  /** cash, bank_transfer, mobile_money, or a provider's method (card) from the webhook. */
  paymentMethod: string | null;
  paymentReference: string | null;
  periodEnd: DateOnly;
  periodStart: DateOnly;
  /** Who recorded a cash or transfer payment. */
  recordedBy: { id: Id; name: string } | null;
  /** Derived on the server in the academy's time zone. */
  status: MyFeeStatus;
  studentId: Id;
  voidedAt: Timestamp | null;
}

export interface MyFees {
  /** Payments, newest first. Voided and unpaid rows are left out. */
  data: MyFee[];
  /** What's due now, when the student is behind (see `dueFrom`). */
  due: FeeDue | null;
  /** Whether the academy has online payment set up ("Pay now"). None do yet. */
  onlinePayment: boolean;
  /** End of the latest paid period, from the server's summary. */
  paidThrough: DateOnly | null;
  standing: FeeStanding;
}

/** `summary` next to the page in GET /me/fees: where the student stands today. */
interface MyFeesSummary {
  currentFee: {
    amount: string;
    currency: string;
    description: string;
    dueDate: DateOnly;
    feeId: Id;
    periodEnd: DateOnly;
    periodStart: DateOnly;
  } | null;
  daysOverdue: number | null;
  isOutstanding: boolean;
  on: DateOnly;
  overdueSince: DateOnly | null;
  paidThrough: DateOnly | null;
}

const MAX_FEES = 500;
const PAGE_SIZE = 200;

/** The period after `fee`: the next calendar month, or the same number of days. */
function periodAfter(fee: MyFee): { start: DateOnly; end: DateOnly } {
  if (isWholeMonth(fee.periodStart, fee.periodEnd)) {
    const next = addMonths(monthOf(fee.periodStart), 1);
    return { start: firstOfMonth(next), end: lastOfMonth(next) };
  }
  const start = addDays(fee.periodEnd, 1);
  return {
    start,
    end: addDays(start, daysBetween(fee.periodStart, fee.periodEnd)),
  };
}

/**
 * What's due, from the server's summary. A billed fee (`currentFee`) is used as is.
 * Nothing on the server creates unpaid fees yet, so usually the student is simply
 * past the end of their last paid period: then the next period is the one after it
 * and the amount is taken from that last payment, marked `estimated` (the academy has
 * no fee schedule to ask). With no payment at all the amount is unknown: no `due`,
 * and the standing is "unknown".
 */
function dueFrom(summary: MyFeesSummary, paid: MyFee[]): FeeDue | null {
  if (!summary.isOutstanding) {
    return null;
  }
  if (summary.currentFee) {
    const { amount, currency, dueDate, periodStart, periodEnd, feeId } =
      summary.currentFee;
    return {
      amount,
      currency,
      dueDate,
      periodStart,
      periodEnd,
      feeId,
      estimated: false,
    };
  }
  const [last] = [...paid].sort((a, b) =>
    b.periodEnd.localeCompare(a.periodEnd)
  );
  if (!last) {
    return null;
  }
  const period = periodAfter(last);
  return {
    amount: last.amount,
    currency: last.currency,
    dueDate: summary.overdueSince ?? period.start,
    periodStart: period.start,
    periodEnd: period.end,
    feeId: null,
    estimated: true,
  };
}

function standingFrom(summary: MyFeesSummary, due: FeeDue | null): FeeStanding {
  if (due) {
    return "due";
  }
  return summary.isOutstanding ? "unknown" : "paid_up";
}

async function loadAll(
  academyId: Id
): Promise<{ rows: MyFee[]; summary: MyFeesSummary }> {
  const collect = async (
    cursor: string | null,
    rows: MyFee[]
  ): Promise<{ rows: MyFee[]; summary: MyFeesSummary }> => {
    const body = await apiRaw<Page<MyFee> & { summary: MyFeesSummary }>(
      "/me/fees",
      {
        query: {
          academyId,
          limit: PAGE_SIZE,
          ...(cursor ? { cursor } : {}),
        },
      }
    );
    const next = [...rows, ...body.data];
    return body.nextCursor && next.length < MAX_FEES
      ? collect(body.nextCursor, next)
      : { rows: next, summary: body.summary };
  };
  return await collect(null, []);
}

/**
 * GET /api/v1/me/fees?academyId=
 * The caller's own payments (paid, not voided), newest first, and what's due now.
 */
export async function listMyFees(academyId: Id): Promise<MyFees> {
  if (mock) {
    return (await mock()).listMyFees(academyId);
  }
  const { rows, summary } = await loadAll(academyId);
  const data = rows
    .filter((fee) => fee.paidAt !== null && fee.voidedAt === null)
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""));
  const due = dueFrom(summary, data);
  return {
    data,
    due,
    // No checkout on the server yet (payment provider not chosen).
    onlinePayment: false,
    paidThrough: summary.paidThrough,
    standing: standingFrom(summary, due),
  };
}

/**
 * GET /api/v1/academies/:academyId/fees/:id
 * One of the caller's own fees (a student sees only their own; others are 404).
 */
export async function getMyFee(academyId: Id, feeId: Id): Promise<MyFee> {
  if (mock) {
    return (await mock()).getMyFee(academyId, feeId);
  }
  return await apiData<MyFee>(academyPath(academyId, `/fees/${feeId}`));
}
