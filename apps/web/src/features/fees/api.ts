/*
 * Fees (AO-4, AO-5, AO-6). Mock implementations of the fee endpoints in
 * "API endpoints.md" (see the convention notes in features/viewer/api.ts).
 * Fees are append-only: a payment is recorded once and can only be voided, never
 * edited or deleted. Voided rows stay in GET /fees and drop out of totals and
 * GET /fees/outstanding.
 */
import { appendAuditEntry, mockNow } from "@/features/audit-log/api";
import {
  DEFAULT_FEE,
  extraMembers,
  extraStudents,
  NOVEMBER_TOTALS,
  pastFees,
} from "@/features/fees/fixtures";
import {
  addMonths,
  type PeriodKey,
  periodDueDate,
  periodKeyOf,
  periodOf,
  periodStart,
} from "@/features/fees/periods";
import {
  academies,
  fixtureDelay,
  fees as fixtureFees,
  members as fixtureMembers,
  teams as fixtureTeams,
  users,
} from "@/features/fixtures";
import type {
  DateOnly,
  Fee,
  Id,
  Money,
  OutstandingFee,
  PaymentMethod,
  Team,
  Timestamp,
} from "@/features/types";
import { formatMoney } from "@/lib/format";

/** A student as the fee screens show them (name, team, last payment). */
export interface FeeStudent {
  id: Id;
  lastPaidAt: Timestamp | null;
  name: string;
  teamId: Id | null;
  teamName: string | null;
}

/**
 * GET /fees row plus the names the table shows. The real response is `Fee`; the
 * names come from the academy's member list (Better Auth `listMembers`).
 */
export interface PaymentRow extends Fee {
  recordedByName: string | null;
  student: FeeStudent;
  voidedByName: string | null;
}

/** GET /fees/outstanding row plus the student's name and team. */
export interface OutstandingRow extends OutstandingFee {
  student: FeeStudent;
}

export interface FeeSummary {
  collected: Money;
  /** Share of this month's payments made online (mobile money), 0..1. */
  onlineShare: number;
  outstanding: Money;
  paidStudentCount: number;
  period: PeriodKey;
  unpaidStudentCount: number;
}

export interface RecordPaymentInput {
  amount: string;
  currency: string;
  description: string;
  paidAt: Timestamp;
  paymentMethod: PaymentMethod;
  paymentReference: string | null;
  periodEnd: DateOnly;
  periodStart: DateOnly;
  studentId: Id;
}

/** POST /fees answers 409 when the student already has a payment for that period. */
export class DuplicatePaymentError extends Error {
  readonly existingFeeId: Id;

  constructor(existingFeeId: Id) {
    super("This student already has a payment for that period.");
    this.name = "DuplicatePaymentError";
    this.existingFeeId = existingFeeId;
  }
}

/** POST /fees/:id/void answers 409 when the fee is already voided. */
export class AlreadyVoidedError extends Error {
  constructor() {
    super("This payment is already voided.");
    this.name = "AlreadyVoidedError";
  }
}

const allUsers = [...users, ...extraStudents];
const allMembers = [...fixtureMembers, ...extraMembers];

let feeStore: Fee[] = [...fixtureFees, ...pastFees];

/** Changes made in this session to the November totals (they aren't derived from the table). */
const sessionTotals = { collected: 0, paidStudents: 0 };

function academyTimezone(academyId: Id): string {
  return academies.find((a) => a.id === academyId)?.timezone ?? "UTC";
}

function nameOf(userId: Id | null): string | null {
  if (!userId) {
    return null;
  }
  return allUsers.find((u) => u.id === userId)?.name ?? null;
}

function isPaid(fee: Fee): boolean {
  return fee.paidAt !== null && fee.voidedAt === null;
}

function lastPaidFee(studentId: Id): Fee | null {
  return (
    feeStore
      .filter((fee) => fee.studentId === studentId && isPaid(fee))
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart))[0] ?? null
  );
}

function studentsOf(academyId: Id): FeeStudent[] {
  return allMembers
    .filter((m) => m.academyId === academyId && m.roles.includes("student"))
    .map((m) => {
      const teamId = m.teamIds[0] ?? null;
      return {
        id: m.userId,
        name: m.user.name,
        teamId,
        teamName: fixtureTeams.find((t) => t.id === teamId)?.name ?? null,
        lastPaidAt: lastPaidFee(m.userId)?.paidAt ?? null,
      };
    });
}

function studentOf(academyId: Id, studentId: Id): FeeStudent {
  return (
    studentsOf(academyId).find((s) => s.id === studentId) ?? {
      id: studentId,
      name: nameOf(studentId) ?? "Former student",
      teamId: null,
      teamName: null,
      lastPaidAt: null,
    }
  );
}

function joinedAt(academyId: Id, studentId: Id): Timestamp | null {
  return (
    allMembers.find((m) => m.academyId === academyId && m.userId === studentId)
      ?.createdAt ?? null
  );
}

function toRow(academyId: Id, fee: Fee): PaymentRow {
  return {
    ...fee,
    student: studentOf(academyId, fee.studentId),
    recordedByName: nameOf(fee.recordedBy),
    voidedByName: nameOf(fee.voidedBy),
  };
}

function currentPeriod(academyId: Id): PeriodKey {
  return periodOf(mockNow(), academyTimezone(academyId));
}

function outstandingFor(academyId: Id, period: PeriodKey): OutstandingRow[] {
  const due = periodDueDate(period);
  const rows: OutstandingRow[] = [];
  for (const student of studentsOf(academyId)) {
    const joined = joinedAt(academyId, student.id);
    const owesThisPeriod = joined === null || joined.slice(0, 10) <= due;
    const coversPeriod = feeStore.some(
      (fee) =>
        fee.studentId === student.id &&
        isPaid(fee) &&
        fee.periodStart === periodStart(period)
    );
    if (!owesThisPeriod || coversPeriod) {
      continue;
    }
    const last = lastPaidFee(student.id);
    const firstUnpaid =
      last && periodKeyOf(last.periodStart) < period
        ? addMonths(periodKeyOf(last.periodStart), 1)
        : period;
    let months = 1;
    while (addMonths(firstUnpaid, months - 1) < period) {
      months += 1;
    }
    rows.push({
      studentId: student.id,
      teamId: student.teamId,
      amount: (Number(DEFAULT_FEE.amount) * months).toFixed(2),
      currency: DEFAULT_FEE.currency,
      dueDate: periodDueDate(firstUnpaid),
      lastPaidAt: last?.paidAt ?? null,
      student,
    });
  }
  return rows;
}

/**
 * Real: `GET /api/v1/academies/:academyId/fees?from=&to=` (by period), newest first.
 * `period` null returns every period.
 */
export async function listFees(
  academyId: Id,
  params: { period: PeriodKey | null }
): Promise<PaymentRow[]> {
  await fixtureDelay();
  const start = params.period ? periodStart(params.period) : null;
  return feeStore
    .filter((fee) => fee.academyId === academyId)
    .filter((fee) => start === null || fee.periodStart === start)
    .sort((a, b) =>
      (b.paidAt ?? b.createdAt)
        .slice(0, 10)
        .localeCompare((a.paidAt ?? a.createdAt).slice(0, 10))
    )
    .map((fee) => toRow(academyId, fee));
}

/** Real: `GET /api/v1/academies/:academyId/fees/outstanding?teamId=&on=` (on defaults to today). */
export async function listOutstandingFees(
  academyId: Id,
  params: { teamId: Id | null }
): Promise<OutstandingRow[]> {
  await fixtureDelay();
  return outstandingFor(academyId, currentPeriod(academyId)).filter(
    (row) => !params.teamId || row.teamId === params.teamId
  );
}

/**
 * This month's totals for the summary cards. Real: the outstanding part comes from
 * `GET /dashboard` (outstanding fees); "collected" and the online/cash split need a
 * totals field on `GET /fees` or the dashboard (not in the API doc yet).
 */
export async function getFeeSummary(academyId: Id): Promise<FeeSummary> {
  await fixtureDelay();
  const period = currentPeriod(academyId);
  const outstanding = outstandingFor(academyId, period);
  const outstandingTotal = outstanding.reduce(
    (sum, row) => sum + Number(row.amount),
    0
  );
  return {
    period,
    collected: {
      amount: (
        Number(NOVEMBER_TOTALS.collected) + sessionTotals.collected
      ).toFixed(2),
      currency: DEFAULT_FEE.currency,
    },
    paidStudentCount:
      NOVEMBER_TOTALS.paidStudentCount + sessionTotals.paidStudents,
    outstanding: {
      amount: outstandingTotal.toFixed(2),
      currency: DEFAULT_FEE.currency,
    },
    unpaidStudentCount: outstanding.length,
    onlineShare: NOVEMBER_TOTALS.onlineShare,
  };
}

/** Students and teams for the pickers. Real: Better Auth `listMembers` + `listTeams`. */
export async function listFeeStudents(academyId: Id): Promise<FeeStudent[]> {
  await fixtureDelay();
  return studentsOf(academyId).sort((a, b) => a.name.localeCompare(b.name));
}

export async function listFeeTeams(academyId: Id): Promise<Team[]> {
  await fixtureDelay();
  return fixtureTeams.filter((t) => t.academyId === academyId);
}

/** The academy's usual fee, used to pre-fill "Amount". */
export async function getDefaultFee(_academyId: Id): Promise<Money> {
  await fixtureDelay();
  return { ...DEFAULT_FEE };
}

/**
 * Real: `POST /api/v1/academies/:academyId/fees` with an `Idempotency-Key` header.
 * Same student + period → 409 (DuplicatePaymentError). `recordedBy` comes from the
 * session on the server; the mock takes it as `actorId`.
 */
export async function recordPayment(
  academyId: Id,
  input: RecordPaymentInput,
  actorId: Id
): Promise<Fee> {
  await fixtureDelay();
  const existing = feeStore.find(
    (other) =>
      other.studentId === input.studentId &&
      other.periodStart === input.periodStart &&
      isPaid(other)
  );
  if (existing) {
    throw new DuplicatePaymentError(existing.id);
  }
  const fee: Fee = {
    id: `fee-${crypto.randomUUID()}`,
    academyId,
    studentId: input.studentId,
    description: input.description,
    periodStart: input.periodStart,
    periodEnd: input.periodEnd,
    amount: Number(input.amount).toFixed(2),
    currency: input.currency,
    dueDate: periodDueDate(periodKeyOf(input.periodStart)),
    paidAt: input.paidAt,
    paymentMethod: input.paymentMethod,
    paymentReference: input.paymentReference,
    createdAt: mockNow().toISOString(),
    recordedBy: actorId,
    voidedAt: null,
    voidedBy: null,
    voidReason: null,
  };
  feeStore = [fee, ...feeStore];
  if (periodKeyOf(fee.periodStart) === currentPeriod(academyId)) {
    sessionTotals.collected += Number(fee.amount);
    sessionTotals.paidStudents += 1;
  }
  return fee;
}

/**
 * Real: `POST /api/v1/academies/:academyId/fees/:id/void` with `{ reason }`. Sets
 * voidedAt / voidedBy / voidReason and writes audit_log in one transaction.
 */
export async function voidFee(
  academyId: Id,
  feeId: Id,
  input: { reason: string },
  actorId: Id
): Promise<Fee> {
  await fixtureDelay();
  const fee = feeStore.find((f) => f.id === feeId && f.academyId === academyId);
  if (!fee) {
    throw new Error("Payment not found.");
  }
  if (fee.voidedAt) {
    throw new AlreadyVoidedError();
  }
  const now = mockNow();
  const voided: Fee = {
    ...fee,
    voidedAt: now.toISOString(),
    voidedBy: actorId,
    voidReason: input.reason,
  };
  feeStore = feeStore.map((f) => (f.id === feeId ? voided : f));
  if (periodKeyOf(fee.periodStart) === currentPeriod(academyId)) {
    sessionTotals.collected -= Number(fee.amount);
    sessionTotals.paidStudents -= 1;
  }
  const stamp = (value: string | null) =>
    value ? value.replace("T", " ").slice(0, 16) : null;
  appendAuditEntry({
    academyId,
    actorId,
    action: "fee.void",
    entityType: "fee",
    entityId: fee.id,
    before: {
      amount: `${fee.amount} ${fee.currency}`,
      paid_at: fee.paidAt?.slice(0, 10) ?? null,
      voided_at: null,
    },
    after: {
      amount: `${fee.amount} ${fee.currency}`,
      paid_at: fee.paidAt?.slice(0, 10) ?? null,
      voided_at: stamp(voided.voidedAt),
    },
    reason: input.reason,
    subject: { id: fee.studentId, name: nameOf(fee.studentId) ?? "Student" },
    summary: formatMoney({ amount: fee.amount, currency: fee.currency }),
  });
  return voided;
}

/** The current time; fixture time in mock mode. */
export function feesNow(): Date {
  return mockNow();
}
