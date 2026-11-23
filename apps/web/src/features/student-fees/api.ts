/*
 * The student's own fees (ST-5), read-only. Mock-data convention: see
 * features/viewer/api.ts.
 */
import {
  fees,
  fixtureDelay,
  outstandingFees,
  users,
} from "@/features/fixtures";
import type { DateOnly, Fee, Id } from "@/features/types";

/** The period the student has not paid for yet. */
export interface FeeDue {
  amount: string;
  currency: string;
  dueDate: DateOnly;
  periodEnd: DateOnly;
  periodStart: DateOnly;
}

export interface MyFee extends Fee {
  /** Joined for the receipt: who recorded a cash or transfer payment. */
  recordedByName: string | null;
}

export interface MyFees {
  /** Payments, newest first. Voided payments are left out. */
  data: MyFee[];
  /** Assumed addition to /me/fees (the API doc lists only payments): what's due next. */
  due: FeeDue | null;
  /** Whether the academy has online payment set up ("Pay now"). None do yet. */
  onlinePayment: boolean;
}

const STUDENT_ID = "user-aline";

/** The month a student's fee is for, from its due date ("2026-11-05" -> Nov 1–30). */
function periodFor(dueDate: DateOnly): { start: DateOnly; end: DateOnly } {
  const [year = 0, month = 1] = dueDate.split("-").map(Number);
  const start = `${dueDate.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

/**
 * GET /api/v1/me/fees?academyId=
 * The caller's own payments, plus (assumed) the fee that is due next.
 */
export async function listMyFees(academyId: Id): Promise<MyFees> {
  await fixtureDelay();
  const data = fees
    .filter(
      (fee) =>
        fee.studentId === STUDENT_ID &&
        fee.academyId === academyId &&
        fee.voidedAt === null &&
        fee.paidAt !== null
    )
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))
    .map((fee) => ({
      ...fee,
      recordedByName: users.find((u) => u.id === fee.recordedBy)?.name ?? null,
    }));
  const outstanding = outstandingFees.find((o) => o.studentId === STUDENT_ID);
  const due: FeeDue | null = outstanding
    ? {
        amount: outstanding.amount,
        currency: outstanding.currency,
        dueDate: outstanding.dueDate,
        periodStart: periodFor(outstanding.dueDate).start,
        periodEnd: periodFor(outstanding.dueDate).end,
      }
    : null;
  return { data, due, onlinePayment: false };
}
