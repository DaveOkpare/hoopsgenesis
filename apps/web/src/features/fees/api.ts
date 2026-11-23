/*
 * Fees (AO-4, AO-5, AO-6) against /api/v1/academies/:academyId/fees. Fees are
 * append-only: a payment is recorded once and can only be voided, never edited or
 * deleted. Voided rows stay in GET /fees and drop out of totals and GET /fees/outstanding.
 * Preview mode uses ./api.mock.ts (see lib/preview.ts).
 *
 * Fee rows carry only the student's id, so names and teams come from the academy's
 * member list and rosters (./student-directory.ts). The server names the people who
 * recorded and voided a payment itself (`recordedBy` / `voidedBy: { id, name }`).
 */
import {
  addMonths,
  type PeriodKey,
  periodDueDate,
  periodEnd,
  periodKeyOf,
  periodOf,
  periodStart,
} from "@/features/fees/periods";
import {
  loadAcademy,
  loadStudentDirectory,
  type StudentDirectory,
} from "@/features/fees/student-directory";
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
import {
  academyPath,
  apiAll,
  apiData,
  apiRaw,
  isApiError,
} from "@/lib/api-client";
import { appNow, isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** A student as the fee screens show them (name, team, last payment). */
export interface FeeStudent {
  id: Id;
  lastPaidAt: Timestamp | null;
  name: string;
  teamId: Id | null;
  teamName: string | null;
}

/** GET /fees row plus the names the table shows. */
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

/** POST /fees answers 409 `fee_period_exists` when the period is already paid. */
export class DuplicatePaymentError extends Error {
  readonly existingFeeId: Id;

  constructor(existingFeeId: Id, options?: ErrorOptions) {
    super("This student already has a payment for that period.", options);
    this.name = "DuplicatePaymentError";
    this.existingFeeId = existingFeeId;
  }
}

/** POST /fees/:id/void answers 409 `already_voided`. */
export class AlreadyVoidedError extends Error {
  constructor(
    message = "This payment is already voided.",
    options?: ErrorOptions
  ) {
    super(message, options);
    this.name = "AlreadyVoidedError";
  }
}

/** A fee as the server sends it (see server/api/v1/fees-core.ts `serializeFee`). */
interface ServerFee {
  academyId: Id;
  amount: string;
  createdAt: Timestamp;
  currency: string;
  description: string;
  dueDate: DateOnly;
  id: Id;
  paidAt: Timestamp | null;
  paymentMethod: string | null;
  paymentReference: string | null;
  periodEnd: DateOnly;
  periodStart: DateOnly;
  recordedBy: { id: Id; name: string } | null;
  recordedById: Id | null;
  studentId: Id;
  voidedAt: Timestamp | null;
  voidedBy: { id: Id; name: string } | null;
  voidedById: Id | null;
  voidReason: string | null;
}

/** One GET /fees/outstanding row (server/api/v1/fees.ts). */
interface ServerOutstanding {
  currentFee: {
    amount: string;
    currency: string;
    dueDate: DateOnly;
  } | null;
  daysOverdue: number | null;
  lastPayment: { paidAt: Timestamp } | null;
  overdueSince: DateOnly | null;
  student: { id: Id; name: string };
  teams: { id: Id; name: string }[];
}

const PAYMENT_METHODS: readonly PaymentMethod[] = [
  "cash",
  "bank_transfer",
  "mobile_money",
];

function toPaymentMethod(value: string | null): PaymentMethod | null {
  return PAYMENT_METHODS.find((method) => method === value) ?? null;
}

function toFee(row: ServerFee): Fee {
  return {
    id: row.id,
    academyId: row.academyId,
    studentId: row.studentId,
    description: row.description,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    amount: row.amount,
    currency: row.currency,
    dueDate: row.dueDate,
    paidAt: row.paidAt,
    paymentMethod: toPaymentMethod(row.paymentMethod),
    paymentReference: row.paymentReference,
    createdAt: row.createdAt,
    recordedBy: row.recordedById,
    voidedAt: row.voidedAt,
    voidedBy: row.voidedById,
    voidReason: row.voidReason,
  };
}

const isPaid = (fee: { paidAt: string | null; voidedAt: string | null }) =>
  fee.paidAt !== null && fee.voidedAt === null;

/** Newest paid (not voided) payment per student, by period. */
function lastPaidByStudent(fees: readonly ServerFee[]): Map<Id, Timestamp> {
  const best = new Map<Id, ServerFee>();
  for (const fee of fees) {
    if (!isPaid(fee)) {
      continue;
    }
    const current = best.get(fee.studentId);
    if (!current || fee.periodStart > current.periodStart) {
      best.set(fee.studentId, fee);
    }
  }
  return new Map(
    [...best].map(([id, fee]) => [id, fee.paidAt ?? fee.createdAt])
  );
}

function studentFrom(
  directory: StudentDirectory,
  id: Id,
  lastPaid: Map<Id, Timestamp>,
  fallbackName?: string
): FeeStudent {
  const person = directory.people.get(id);
  return {
    id,
    name: person?.name ?? fallbackName ?? "Former student",
    teamId: person?.teamId ?? null,
    teamName: person?.teamName ?? null,
    lastPaidAt: lastPaid.get(id) ?? null,
  };
}

const listAllFees = (
  academyId: Id,
  query: Record<string, string | undefined> = {}
) => apiAll<ServerFee>(academyPath(academyId, "/fees"), { query });

async function timeZoneOf(academyId: Id): Promise<string> {
  return (await loadAcademy(academyId))?.timezone ?? "UTC";
}

/**
 * `GET /fees?from=&to=` (periods overlapping the month; `period` null = every period),
 * newest payment first.
 */
export async function listFees(
  academyId: Id,
  params: { period: PeriodKey | null }
): Promise<PaymentRow[]> {
  if (mock) {
    return (await mock()).listFees(academyId, params);
  }
  const range = params.period
    ? { from: periodStart(params.period), to: periodEnd(params.period) }
    : {};
  const [rows, everyFee, directory] = await Promise.all([
    listAllFees(academyId, range),
    params.period ? listAllFees(academyId) : Promise.resolve(null),
    loadStudentDirectory(academyId),
  ]);
  const lastPaid = lastPaidByStudent(everyFee ?? rows);
  return rows
    .map(
      (row): PaymentRow => ({
        ...toFee(row),
        student: studentFrom(directory, row.studentId, lastPaid),
        recordedByName: row.recordedBy?.name ?? null,
        voidedByName: row.voidedBy?.name ?? null,
      })
    )
    .sort((a, b) =>
      (b.paidAt ?? b.createdAt)
        .slice(0, "YYYY-MM-DD".length)
        .localeCompare((a.paidAt ?? a.createdAt).slice(0, "YYYY-MM-DD".length))
    );
}

/** Most common amount among recent payments: the academy's usual monthly fee. */
function usualFee(fees: readonly ServerFee[]): Money | null {
  const recent = fees
    .filter(isPaid)
    .sort((a, b) => b.periodStart.localeCompare(a.periodStart))
    .slice(0, 50);
  const counts = new Map<string, { money: Money; count: number }>();
  for (const fee of recent) {
    const key = `${fee.amount} ${fee.currency}`;
    const entry = counts.get(key) ?? {
      money: { amount: fee.amount, currency: fee.currency },
      count: 0,
    };
    entry.count += 1;
    counts.set(key, entry);
  }
  return (
    [...counts.values()].sort((a, b) => b.count - a.count)[0]?.money ?? null
  );
}

function monthsOwed(since: DateOnly | null, current: PeriodKey): number {
  if (!since) {
    return 1;
  }
  let months = 1;
  const first = periodKeyOf(since);
  while (addMonths(first, months - 1) < current) {
    months += 1;
  }
  return months;
}

/**
 * `GET /fees/outstanding?teamId=` (on = today): students with no paid fee covering
 * today. The server has no amount for students who were never billed; the amount shown
 * is their billed fee when there is one, else the usual fee per month owed.
 */
export async function listOutstandingFees(
  academyId: Id,
  params: { teamId: Id | null }
): Promise<OutstandingRow[]> {
  if (mock) {
    return (await mock()).listOutstandingFees(academyId, params);
  }
  const [rows, fees, directory, timeZone] = await Promise.all([
    apiAll<ServerOutstanding>(academyPath(academyId, "/fees/outstanding"), {
      query: { teamId: params.teamId },
    }),
    listAllFees(academyId),
    loadStudentDirectory(academyId),
    timeZoneOf(academyId),
  ]);
  const usual = usualFee(fees);
  const current = periodOf(appNow(), timeZone);
  const lastPaid = lastPaidByStudent(fees);
  return rows.map((row) => {
    const months = monthsOwed(row.overdueSince, current);
    const amount =
      row.currentFee?.amount ??
      (usual ? (Number(usual.amount) * months).toFixed(2) : "0.00");
    const team = row.teams[0] ?? null;
    return {
      studentId: row.student.id,
      teamId: team?.id ?? null,
      amount,
      currency: row.currentFee?.currency ?? usual?.currency ?? "",
      dueDate:
        row.currentFee?.dueDate ?? row.overdueSince ?? periodDueDate(current),
      lastPaidAt: row.lastPayment?.paidAt ?? null,
      student: {
        ...studentFrom(directory, row.student.id, lastPaid, row.student.name),
        name: row.student.name,
        teamId: team?.id ?? null,
        teamName: team?.name ?? null,
      },
    };
  });
}

/**
 * This month's totals for the summary cards, derived from `GET /fees` for the month and
 * `GET /fees/outstanding` (the API has no totals endpoint). "Online" = mobile money.
 */
export async function getFeeSummary(academyId: Id): Promise<FeeSummary> {
  if (mock) {
    return (await mock()).getFeeSummary(academyId);
  }
  const timeZone = await timeZoneOf(academyId);
  const period = periodOf(appNow(), timeZone);
  const [monthFees, outstanding] = await Promise.all([
    listAllFees(academyId, {
      from: periodStart(period),
      to: periodEnd(period),
    }),
    listOutstandingFees(academyId, { teamId: null }),
  ]);
  const paid = monthFees.filter(
    (fee) => isPaid(fee) && fee.periodStart === periodStart(period)
  );
  const currency =
    paid[0]?.currency ??
    outstanding[0]?.currency ??
    (await loadAcademy(academyId))?.defaultCurrency ??
    "";
  const sum = (amounts: string[]) =>
    amounts.reduce((total, amount) => total + Number(amount), 0).toFixed(2);
  const online = paid.filter((fee) => fee.paymentMethod === "mobile_money");
  return {
    period,
    collected: { amount: sum(paid.map((fee) => fee.amount)), currency },
    paidStudentCount: new Set(paid.map((fee) => fee.studentId)).size,
    outstanding: {
      amount: sum(outstanding.map((row) => row.amount)),
      currency,
    },
    unpaidStudentCount: outstanding.length,
    onlineShare: paid.length === 0 ? 0 : online.length / paid.length,
  };
}

/** Students for the pickers: members with the student role, with team and last payment. */
export async function listFeeStudents(academyId: Id): Promise<FeeStudent[]> {
  if (mock) {
    return (await mock()).listFeeStudents(academyId);
  }
  const [directory, fees] = await Promise.all([
    loadStudentDirectory(academyId),
    listAllFees(academyId),
  ]);
  const lastPaid = lastPaidByStudent(fees);
  return [...directory.people.values()]
    .filter((person) => person.roles.includes("student"))
    .map((person) => studentFrom(directory, person.id, lastPaid))
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function listFeeTeams(academyId: Id): Promise<Team[]> {
  if (mock) {
    return (await mock()).listFeeTeams(academyId);
  }
  const directory = await loadStudentDirectory(academyId);
  return directory.teams.map((team) => ({
    id: team.id,
    academyId,
    name: team.name,
    ageGroup: team.ageGroup,
    createdAt: "",
  }));
}

/**
 * The academy's usual fee, used to pre-fill "Amount". There is no fee setting on the
 * server, so it is the most common amount among recent payments (empty when the
 * academy has none yet), in the academy's default currency.
 */
export async function getDefaultFee(academyId: Id): Promise<Money> {
  if (mock) {
    return (await mock()).getDefaultFee(academyId);
  }
  const usual = usualFee(await listAllFees(academyId));
  if (usual) {
    return usual;
  }
  const academy = await loadAcademy(academyId);
  return { amount: "", currency: academy?.defaultCurrency ?? "" };
}

/**
 * `POST /fees` with an `Idempotency-Key` (one per "Save payment" action, reused if the
 * same action is retried). Same student + period → 409 `fee_period_exists`
 * (DuplicatePaymentError). The server takes `recordedBy` from the session.
 */
export async function recordPayment(
  academyId: Id,
  input: RecordPaymentInput,
  idempotencyKey: string
): Promise<Fee> {
  if (mock) {
    return (await mock()).recordPayment(academyId, input, idempotencyKey);
  }
  try {
    const row = await apiData<ServerFee>(academyPath(academyId, "/fees"), {
      method: "POST",
      idempotencyKey,
      body: {
        studentId: input.studentId,
        description: input.description,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        dueDate: periodDueDate(periodKeyOf(input.periodStart)),
        amount: input.amount,
        currency: input.currency,
        paidAt: input.paidAt,
        paymentMethod: input.paymentMethod,
        ...(input.paymentReference
          ? { paymentReference: input.paymentReference }
          : {}),
      },
    });
    return toFee(row);
  } catch (error) {
    if (isApiError(error, "fee_period_exists")) {
      const details = error.details as { feeId?: string } | undefined;
      throw new DuplicatePaymentError(details?.feeId ?? "", { cause: error });
    }
    throw error;
  }
}

/** `POST /fees/:id/void` with `{ reason }`; the server writes the audit row. */
export async function voidFee(
  academyId: Id,
  feeId: Id,
  input: { reason: string }
): Promise<Fee> {
  if (mock) {
    return (await mock()).voidFee(academyId, feeId, input);
  }
  try {
    const body = await apiRaw<{ data: ServerFee }>(
      academyPath(academyId, `/fees/${encodeURIComponent(feeId)}/void`),
      { method: "POST", body: { reason: input.reason } }
    );
    return toFee(body.data);
  } catch (error) {
    if (isApiError(error, "already_voided")) {
      throw new AlreadyVoidedError(undefined, { cause: error });
    }
    throw error;
  }
}

/** Students who haven't paid for today, for the sidebar badge (`GET /fees/outstanding`). */
export async function countOutstandingFees(academyId: Id): Promise<number> {
  if (mock) {
    return (await mock()).countOutstandingFees(academyId);
  }
  const rows = await apiAll<ServerOutstanding>(
    academyPath(academyId, "/fees/outstanding")
  );
  return rows.length;
}
