/**
 * Fee helpers shared by the fee endpoints (./fees.ts) and the payment webhook
 * (./payment-webhook.ts): the derived status, serialization, the "live fee
 * for this period" lookup and the outstanding-list queries.
 *
 * Fee state is derived, never stored:
 * - voided:  voided_at is set (wins over everything else)
 * - paid:    paid_at is set
 * - overdue: not paid and due_date is before today (academy time zone)
 * - unpaid:  not paid and due_date is today or later
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { ConflictError } from "../errors";
import { decodeCursor, encodeCursor } from "../pagination";
import { loadPeople, type People, personRef } from "../people";
import type { DbClient } from "../scope";
import {
  fromPlainDate,
  toMoneyString,
  toNullableTimestamp,
  toPlainDate,
  toTimestamp,
} from "../serialize";
import { addDays, daysBetween } from "../time";

export const FEE_STATUSES = ["paid", "unpaid", "overdue", "voided"] as const;
export type FeeStatus = (typeof FEE_STATUSES)[number];

type FeeRow = Prisma.FeeModel;

export const deriveFeeStatus = (
  fee: Pick<FeeRow, "voidedAt" | "paidAt" | "dueDate">,
  today: string
): FeeStatus => {
  if (fee.voidedAt) {
    return "voided";
  }
  if (fee.paidAt) {
    return "paid";
  }
  return toPlainDate(fee.dueDate) < today ? "overdue" : "unpaid";
};

/**
 * A fee row in its API form. `today` is the academy's today (YYYY-MM-DD).
 * `people` names `recordedById` and `voidedById` as `recordedBy` /
 * `voidedBy: { id, name }` (see `serializeFeeRows`).
 */
export const serializeFee = (row: FeeRow, today: string, people: People) => ({
  id: row.id,
  academyId: row.academyId,
  studentId: row.studentId,
  description: row.description,
  periodStart: toPlainDate(row.periodStart),
  periodEnd: toPlainDate(row.periodEnd),
  amount: toMoneyString(row.amount),
  currency: row.currency,
  dueDate: toPlainDate(row.dueDate),
  paidAt: toNullableTimestamp(row.paidAt),
  paymentMethod: row.paymentMethod,
  paymentReference: row.paymentReference,
  status: deriveFeeStatus(row, today),
  recordedById: row.recordedById,
  recordedBy: personRef(people, row.recordedById),
  createdAt: toTimestamp(row.createdAt),
  voidedAt: toNullableTimestamp(row.voidedAt),
  voidedById: row.voidedById,
  voidedBy: personRef(people, row.voidedById),
  voidReason: row.voidReason,
});

export type SerializedFee = ReturnType<typeof serializeFee>;

/** The users fee rows name, for `loadPeople`. */
export const feePeopleIds = (rows: readonly FeeRow[]): (string | null)[] =>
  rows.flatMap((row) => [row.recordedById, row.voidedById]);

/** One fee, serialized with its people (one user lookup). */
export const serializeFeeRow = async (
  client: DbClient,
  row: FeeRow,
  today: string
): Promise<SerializedFee> =>
  serializeFee(row, today, await loadPeople(client, feePeopleIds([row])));

/** The live (not voided) fee for a student's period, if there is one. */
export const findLiveFeeForPeriod = (
  client: DbClient,
  where: { academyId: string; studentId: string; periodStart: string }
): Promise<{ id: string } | null> =>
  client.fee.findFirst({
    where: {
      academyId: where.academyId,
      studentId: where.studentId,
      periodStart: fromPlainDate(where.periodStart),
      voidedAt: null,
    },
    select: { id: true },
  });

/** 409 for a second live fee on the same period; `details.feeId` links to it. */
export const periodTakenError = (feeId: string): ConflictError =>
  new ConflictError(
    "A fee for this student and period already exists; void it first to record it again",
    { code: "fee_period_exists", details: { feeId } }
  );

/** Is this a unique-constraint error (P2002)? */
export const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

// ---------------------------------------------------------------------------
// Outstanding list

export interface OutstandingStudentRow {
  email: string;
  id: string;
  image: string | null;
  name: string;
}

const outstandingCursorSchema = z.tuple([z.string(), z.string().min(1)]);

export const encodeOutstandingCursor = (row: OutstandingStudentRow): string =>
  encodeCursor([row.name, row.id]);

/**
 * Student members of the academy with no paid, non-voided fee covering `on`,
 * ordered by name then id, `limit + 1` rows from after `cursor`.
 * `studentIds: "all"` means every student; otherwise only those ids.
 */
export const findOutstandingStudents = (
  client: DbClient,
  options: {
    academyId: string;
    on: string;
    studentIds: "all" | readonly string[];
    teamId?: string;
    limit: number;
    cursor?: string;
  }
): Promise<OutstandingStudentRow[]> => {
  const { academyId, on, studentIds, teamId, limit, cursor } = options;
  if (studentIds !== "all" && studentIds.length === 0) {
    return Promise.resolve([]);
  }
  const scopeFilter =
    studentIds === "all"
      ? Prisma.empty
      : Prisma.sql`AND u.id IN (${Prisma.join(studentIds)})`;
  const teamFilter = teamId
    ? Prisma.sql`AND EXISTS (
        SELECT 1 FROM "teamMember" tm
        WHERE tm."teamId" = ${teamId} AND tm."userId" = u.id
      )`
    : Prisma.empty;
  let cursorFilter = Prisma.empty;
  if (cursor) {
    const [name, id] = decodeCursor(cursor, outstandingCursorSchema);
    cursorFilter = Prisma.sql`AND (u.name, u.id) > (${name}, ${id})`;
  }
  return client.$queryRaw<OutstandingStudentRow[]>`
    SELECT u.id, u.name, u.email, u.image
    FROM member m
    JOIN "user" u ON u.id = m."userId"
    WHERE m."organizationId" = ${academyId}
      AND 'student' = ANY (string_to_array(replace(m.role, ' ', ''), ','))
      ${scopeFilter}
      ${teamFilter}
      AND NOT EXISTS (
        SELECT 1 FROM fee f
        WHERE f.academy_id = ${academyId}
          AND f.student_id = u.id
          AND f.paid_at IS NOT NULL
          AND f.voided_at IS NULL
          AND f.period_start <= ${on}::date
          AND f.period_end >= ${on}::date
      )
      ${cursorFilter}
    ORDER BY u.name, u.id
    LIMIT ${limit + 1}
  `;
};

export interface LastPayment {
  amount: string;
  currency: string;
  feeId: string;
  paidAt: string;
  periodEnd: string;
  periodStart: string;
}

export interface PaymentStanding {
  /** A billed (unpaid, not voided) fee whose period covers `on`, if any. */
  currentFee: {
    amount: string;
    currency: string;
    /** e.g. "November fee", for "November fee due" (ST-5). */
    description: string;
    dueDate: string;
    feeId: string;
    periodEnd: string;
    periodStart: string;
  } | null;
  /** Whole days past due on `on`; 0 when due today; null when unknown. */
  daysOverdue: number | null;
  /**
   * The paid, non-voided fee with the latest period ending before `on`
   * (later prepayments are not "last" as of `on`).
   */
  lastPayment: LastPayment | null;
  /** The date the student's fee fell due, or null when unknown. */
  overdueSince: string | null;
}

interface PaidRow {
  amount: Prisma.Decimal;
  currency: string;
  id: string;
  paid_at: Date;
  period_end: Date;
  period_start: Date;
  student_id: string;
}

interface BilledRow {
  amount: Prisma.Decimal;
  currency: string;
  description: string;
  due_date: Date;
  id: string;
  period_end: Date;
  period_start: Date;
  student_id: string;
}

const standingFor = (
  on: string,
  lastPaid: PaidRow | undefined,
  billed: BilledRow | undefined
): PaymentStanding => {
  const lastPayment: LastPayment | null = lastPaid
    ? {
        feeId: lastPaid.id,
        periodStart: toPlainDate(lastPaid.period_start),
        periodEnd: toPlainDate(lastPaid.period_end),
        paidAt: toTimestamp(lastPaid.paid_at),
        amount: toMoneyString(lastPaid.amount),
        currency: lastPaid.currency,
      }
    : null;
  if (billed) {
    const dueDate = toPlainDate(billed.due_date);
    return {
      lastPayment,
      currentFee: {
        feeId: billed.id,
        description: billed.description,
        periodStart: toPlainDate(billed.period_start),
        periodEnd: toPlainDate(billed.period_end),
        dueDate,
        amount: toMoneyString(billed.amount),
        currency: billed.currency,
      },
      overdueSince: dueDate,
      daysOverdue: Math.max(0, daysBetween(dueDate, on)),
    };
  }
  if (lastPaid) {
    // Coverage ended on period_end, so the next period fell due the day after.
    const overdueSince = addDays(toPlainDate(lastPaid.period_end), 1);
    return {
      lastPayment,
      currentFee: null,
      overdueSince,
      daysOverdue: Math.max(0, daysBetween(overdueSince, on)),
    };
  }
  return {
    lastPayment,
    currentFee: null,
    overdueSince: null,
    daysOverdue: null,
  };
};

/**
 * Last payment, the billed fee covering `on` and days overdue for each of
 * `studentIds` (who should be outstanding on `on`). Two queries, whatever
 * the number of students.
 */
export const loadPaymentStanding = async (
  client: DbClient,
  academyId: string,
  studentIds: readonly string[],
  on: string
): Promise<Map<string, PaymentStanding>> => {
  const standing = new Map<string, PaymentStanding>();
  if (studentIds.length === 0) {
    return standing;
  }
  const ids = Prisma.join(studentIds);
  const [lastPaidRows, billedRows] = await Promise.all([
    client.$queryRaw<PaidRow[]>`
      SELECT DISTINCT ON (student_id)
        student_id, id, period_start, period_end, paid_at, amount, currency
      FROM fee
      WHERE academy_id = ${academyId} AND student_id IN (${ids})
        AND paid_at IS NOT NULL AND voided_at IS NULL
        AND period_end < ${on}::date
      ORDER BY student_id, period_end DESC, paid_at DESC, id DESC
    `,
    client.$queryRaw<BilledRow[]>`
      SELECT DISTINCT ON (student_id)
        student_id, id, description, period_start, period_end, due_date,
        amount, currency
      FROM fee
      WHERE academy_id = ${academyId} AND student_id IN (${ids})
        AND paid_at IS NULL AND voided_at IS NULL
        AND period_start <= ${on}::date AND period_end >= ${on}::date
      ORDER BY student_id, due_date, id
    `,
  ]);
  const lastPaid = new Map(lastPaidRows.map((row) => [row.student_id, row]));
  const billed = new Map(billedRows.map((row) => [row.student_id, row]));
  for (const id of studentIds) {
    standing.set(id, standingFor(on, lastPaid.get(id), billed.get(id)));
  }
  return standing;
};

/** The teams (in this academy) each student is on, for grouping by team. */
export const loadStudentTeams = async (
  client: DbClient,
  academyId: string,
  studentIds: readonly string[]
): Promise<Map<string, { id: string; name: string }[]>> => {
  const teams = new Map<string, { id: string; name: string }[]>();
  if (studentIds.length === 0) {
    return teams;
  }
  const rows = await client.teamMember.findMany({
    where: {
      userId: { in: [...studentIds] },
      team: { organizationId: academyId },
    },
    select: { userId: true, team: { select: { id: true, name: true } } },
    orderBy: [{ team: { name: "asc" } }, { teamId: "asc" }],
  });
  for (const row of rows) {
    const list = teams.get(row.userId) ?? [];
    list.push(row.team);
    teams.set(row.userId, list);
  }
  return teams;
};
