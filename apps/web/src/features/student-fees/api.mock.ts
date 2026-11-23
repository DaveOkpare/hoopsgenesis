/*
 * Preview-mode (fixture) implementation of features/student-fees/api.ts. Dev only.
 */
import {
  fees,
  fixtureDelay,
  outstandingFees,
  users,
} from "@/features/fixtures";
import type { FeeDue, MyFee, MyFees } from "@/features/student-fees/api";
import type { DateOnly, Fee, Id } from "@/features/types";
import { ApiError } from "@/lib/api-client";

const STUDENT_ID = "user-aline";
/** Aline's billed, unpaid November fee ("Fee detail", FK2-0). */
const DUE_FEE_ID = "fee-aline-nov";
/** The designs' "today" in Kigali. */
const TODAY: DateOnly = "2026-11-23";

/** The month a student's fee is for, from its due date ("2026-11-05" -> Nov 1–30). */
function periodFor(dueDate: DateOnly): { start: DateOnly; end: DateOnly } {
  const [year = 0, month = 1] = dueDate.split("-").map(Number);
  const start = `${dueDate.slice(0, 7)}-01`;
  const end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
  return { start, end };
}

function toMyFee(fee: Fee): MyFee {
  const recorder = users.find((u) => u.id === fee.recordedBy);
  let status: MyFee["status"] = "unpaid";
  if (fee.voidedAt) {
    status = "voided";
  } else if (fee.paidAt) {
    status = "paid";
  } else if (fee.dueDate < TODAY) {
    status = "overdue";
  }
  return {
    ...fee,
    recordedBy: recorder ? { id: recorder.id, name: recorder.name } : null,
    status,
  };
}

/** Aline's unpaid November fee, billed by the academy. */
function dueFeeRow(): Fee | null {
  const outstanding = outstandingFees.find((o) => o.studentId === STUDENT_ID);
  if (!outstanding) {
    return null;
  }
  const period = periodFor(outstanding.dueDate);
  return {
    id: DUE_FEE_ID,
    academyId: "acad-kigali",
    studentId: STUDENT_ID,
    description: "Nov 2026 tuition",
    periodStart: period.start,
    periodEnd: period.end,
    amount: outstanding.amount,
    currency: outstanding.currency,
    dueDate: outstanding.dueDate,
    paidAt: null,
    paymentMethod: null,
    paymentReference: null,
    createdAt: "2026-11-01T08:00:00Z",
    recordedBy: null,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
}

function myRows(academyId: Id): Fee[] {
  const due = dueFeeRow();
  return [...fees, ...(due ? [due] : [])].filter(
    (fee) => fee.studentId === STUDENT_ID && fee.academyId === academyId
  );
}

/**
 * GET /api/v1/me/fees?academyId=
 * The caller's own payments, plus the fee that is due now.
 */
export async function listMyFees(academyId: Id): Promise<MyFees> {
  await fixtureDelay();
  const rows = myRows(academyId);
  const data = rows
    .filter((fee) => fee.voidedAt === null && fee.paidAt !== null)
    .sort((a, b) => (b.paidAt ?? "").localeCompare(a.paidAt ?? ""))
    .map(toMyFee);
  const billed = rows.find((fee) => fee.paidAt === null && !fee.voidedAt);
  const due: FeeDue | null = billed
    ? {
        amount: billed.amount,
        currency: billed.currency,
        dueDate: billed.dueDate,
        periodStart: billed.periodStart,
        periodEnd: billed.periodEnd,
        feeId: billed.id,
        estimated: false,
      }
    : null;
  return {
    data,
    due,
    onlinePayment: false,
    paidThrough: data[0]?.periodEnd ?? null,
    standing: due ? "due" : "paid_up",
  };
}

/** GET /api/v1/academies/:academyId/fees/:id (own fees only). */
export async function getMyFee(academyId: Id, feeId: Id): Promise<MyFee> {
  await fixtureDelay();
  const fee = myRows(academyId).find((row) => row.id === feeId);
  if (!fee) {
    throw new ApiError({
      status: 404,
      code: "not_found",
      message: "Fee not found",
    });
  }
  return toMyFee(fee);
}
