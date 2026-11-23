/**
 * Fees: append-only payment records. Paths are under
 * /api/v1/academies/:academyId unless they start with /api/v1.
 *
 * POST /fees                 academy admin (fee:create)  record an offline payment; Idempotency-Key required
 * GET  /fees                 academy admin: all; coach: own teams' students; student: own rows
 * GET  /fees/:id             same scoping; outside it -> 404
 * GET  /fees/outstanding     academy admin: all; coach: own teams (students -> 403)
 * POST /fees/:id/void        academy admin (fee:void), reason required
 * GET  /api/v1/me/fees       student; ?academyId=; own rows plus a summary
 *
 * The platform owner reads GET /fees, /fees/:id and /fees/outstanding through
 * ./admin-academy-views.ts (same code, read-only member).
 *
 * Every response carries a derived `status` (see ./fees-core.ts). Voided fees
 * stay in lists (struck through in the UI) but never count as paid.
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccess,
  type AcademyAccessResolver,
  academyAccessWith,
  authenticate,
  requireAcademyAccess,
  requireAcademyMember,
  requirePermission,
} from "../access";
import { writeAuditLog } from "../audit";
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RuleViolationError,
  ValidationError,
} from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import { withIdempotency } from "../idempotency";
import {
  encodeTimeIdCursor,
  type Page,
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { loadPeople } from "../people";
import {
  type DbClient,
  getStudentScope,
  isStudentOfAcademy,
  requireVisibleTeam,
  type StudentScope,
} from "../scope";
import { fromPlainDate, toPlainDate } from "../serialize";
import { todayInTimeZone } from "../time";
import {
  currencySchema,
  idSchema,
  isoDateSchema,
  moneyAmountSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
  timestampSchema,
} from "../validation";
import {
  encodeOutstandingCursor,
  feePeopleIds,
  findLiveFeeForPeriod,
  findOutstandingStudents,
  isUniqueViolation,
  loadPaymentStanding,
  loadStudentTeams,
  periodTakenError,
  type SerializedFee,
  serializeFee,
  serializeFeeRow,
} from "./fees-core";

const MAX_DESCRIPTION_LENGTH = 500;
const MAX_METHOD_LENGTH = 64;
const MAX_REFERENCE_LENGTH = 255;
const MAX_REASON_LENGTH = 1000;
/** paidAt may be this far ahead of the server clock (device clock skew). */
const PAID_AT_FUTURE_SKEW_MS = 5 * 60_000;

const feeIdParamsSchema = z.object({ id: idSchema });

const recordFeeSchema = z.object({
  studentId: idSchema,
  description: z.string().trim().min(1).max(MAX_DESCRIPTION_LENGTH),
  periodStart: isoDateSchema,
  periodEnd: isoDateSchema,
  /** Not in the API document; defaults to periodStart. */
  dueDate: isoDateSchema.optional(),
  amount: moneyAmountSchema,
  currency: currencySchema,
  paidAt: timestampSchema,
  paymentMethod: z.string().trim().min(1).max(MAX_METHOD_LENGTH).optional(),
  paymentReference: z
    .string()
    .trim()
    .min(1)
    .max(MAX_REFERENCE_LENGTH)
    .optional(),
});

const voidFeeSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
});

const periodFilterShape = {
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
};

const listFeesQuerySchema = z.object({
  ...paginationQueryShape,
  ...periodFilterShape,
  studentId: idSchema.optional(),
  teamId: idSchema.optional(),
});

const outstandingQuerySchema = z.object({
  ...paginationQueryShape,
  teamId: idSchema.optional(),
  on: isoDateSchema.optional(),
});

const myFeesQuerySchema = z.object({
  ...paginationQueryShape,
  ...periodFilterShape,
  academyId: idSchema,
});

const requireValidRange = (range: { from?: string; to?: string }): void => {
  if (range.from && range.to && range.from > range.to) {
    throw new ValidationError("from must be on or before to", {
      code: "invalid_range",
    });
  }
};

/**
 * Fees whose period overlaps `from`..`to` (both inclusive): a November fee
 * shows up for any range that touches November.
 */
const periodOverlapWhere = (range: {
  from?: string;
  to?: string;
}): Prisma.FeeWhereInput => ({
  ...(range.from ? { periodEnd: { gte: fromPlainDate(range.from) } } : {}),
  ...(range.to ? { periodStart: { lte: fromPlainDate(range.to) } } : {}),
});

const scopeWhere = (scope: StudentScope): Prisma.FeeWhereInput =>
  scope === "all" ? {} : { studentId: { in: [...scope] } };

const loadFeePage = async (
  where: Prisma.FeeWhereInput,
  query: { limit: number; cursor?: string },
  today: string
): Promise<Page<SerializedFee>> => {
  const rows = await db.fee.findMany({
    where: {
      AND: [where, timeIdKeysetWhere("periodStart", query.cursor, "desc")],
    },
    orderBy: [{ periodStart: "desc" }, { id: "desc" }],
    take: query.limit + 1,
  });
  const people = await loadPeople(db, feePeopleIds(rows));
  return toPage(
    rows,
    query.limit,
    (row) => encodeTimeIdCursor(row.periodStart, row.id),
    (row) => serializeFee(row, today, people)
  );
};

// ---------------------------------------------------------------------------
// POST /fees

type RecordFeeInput = z.output<typeof recordFeeSchema>;

const checkRecordFeeRules = async (
  academy: AcademyAccess["academy"],
  input: RecordFeeInput
): Promise<void> => {
  if (input.periodEnd < input.periodStart) {
    throw new ValidationError("periodEnd must be on or after periodStart", {
      code: "invalid_period",
    });
  }
  if (input.paidAt.getTime() > Date.now() + PAID_AT_FUTURE_SKEW_MS) {
    throw new ValidationError("paidAt cannot be in the future", {
      code: "paid_at_in_future",
    });
  }
  if (!(await isStudentOfAcademy(db, academy.id, input.studentId))) {
    throw new RuleViolationError(
      "The student is not a student of this academy",
      {
        code: "student_not_in_academy",
      }
    );
  }
};

const throwPeriodConflictIfTaken = async (
  client: DbClient,
  academyId: string,
  input: RecordFeeInput
): Promise<void> => {
  const existing = await findLiveFeeForPeriod(client, {
    academyId,
    studentId: input.studentId,
    periodStart: input.periodStart,
  });
  if (existing) {
    throw periodTakenError(existing.id);
  }
};

export const recordFee = apiHandler(async (ctx) => {
  const { session, academy } = await requireAcademyAccess(ctx, {
    fee: ["create"],
  });
  const body = await readJsonBody(ctx.request);
  const input = parseBody(recordFeeSchema, body);
  await checkRecordFeeRules(academy, input);
  const today = todayInTimeZone(academy.timezone);

  try {
    return await withIdempotency(
      { request: ctx.request, userId: session.user.id, body, required: true },
      async (tx) => {
        await throwPeriodConflictIfTaken(tx, academy.id, input);
        if (input.paymentReference) {
          const sameReference = await tx.fee.findUnique({
            where: { paymentReference: input.paymentReference },
            select: { id: true, academyId: true },
          });
          if (sameReference) {
            // Only link to it when it is in this academy.
            throw new ConflictError(
              "This payment reference is already recorded",
              {
                code: "payment_reference_exists",
                details:
                  sameReference.academyId === academy.id
                    ? { feeId: sameReference.id }
                    : undefined,
              }
            );
          }
        }
        const fee = await tx.fee.create({
          data: {
            academyId: academy.id,
            studentId: input.studentId,
            description: input.description,
            periodStart: fromPlainDate(input.periodStart),
            periodEnd: fromPlainDate(input.periodEnd),
            dueDate: fromPlainDate(input.dueDate ?? input.periodStart),
            amount: new Prisma.Decimal(input.amount),
            currency: input.currency,
            paidAt: input.paidAt,
            paymentMethod: input.paymentMethod ?? null,
            paymentReference: input.paymentReference ?? null,
            recordedById: session.user.id,
          },
        });
        await writeAuditLog(tx, {
          request: ctx.request,
          session,
          academyId: academy.id,
          action: "fee.create",
          entityType: "fee",
          entityId: fee.id,
          after: fee,
        });
        return {
          status: 201,
          body: { data: await serializeFeeRow(tx, fee, today) },
        };
      }
    );
  } catch (error) {
    // Two requests with different keys at once: the partial unique index
    // stops the second; report it like the in-transaction check does.
    if (isUniqueViolation(error)) {
      await throwPeriodConflictIfTaken(db, academy.id, input);
    }
    throw error;
  }
});

// ---------------------------------------------------------------------------
// GET /fees, GET /fees/:id

const feeReader = academyAccessWith({ fee: ["read"] });

/** GET /fees for `resolve`'s caller (a member, or the platform owner). */
export const listFeesFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const query = parseQuery(listFeesQuerySchema, ctx.request);
    requireValidRange(query);
    const filters: Prisma.FeeWhereInput[] = [
      { academyId: academy.id },
      scopeWhere(await getStudentScope(db, member)),
      periodOverlapWhere(query),
    ];
    if (query.studentId) {
      filters.push({ studentId: query.studentId });
    }
    if (query.teamId) {
      await requireVisibleTeam(db, member, query.teamId);
      filters.push({
        student: { teammembers: { some: { teamId: query.teamId } } },
      });
    }
    return json(
      await loadFeePage(
        { AND: filters },
        query,
        todayInTimeZone(academy.timezone)
      )
    );
  });

/** GET /fees/:id for `resolve`'s caller. */
export const getFeeFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { id } = parseParams(feeIdParamsSchema, ctx.params);
    const fee = await db.fee.findFirst({
      where: {
        AND: [
          { id, academyId: academy.id },
          scopeWhere(await getStudentScope(db, member)),
        ],
      },
    });
    if (!fee) {
      throw new NotFoundError("Fee not found");
    }
    return json({
      data: await serializeFeeRow(db, fee, todayInTimeZone(academy.timezone)),
    });
  });

export const listFees = listFeesFor(feeReader);
export const getFee = getFeeFor(feeReader);

// ---------------------------------------------------------------------------
// GET /fees/outstanding

/** GET /fees/outstanding for `resolve`'s caller. */
export const listOutstandingFeesFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    // "Who hasn't paid" is a staff view; students use /api/v1/me/fees.
    if (!(member.seesWholeAcademy || member.isCoach)) {
      throw new ForbiddenError("Only coaches and academy admins see this list");
    }
    const query = parseQuery(outstandingQuerySchema, ctx.request);
    if (query.teamId) {
      await requireVisibleTeam(db, member, query.teamId);
    }
    const on = query.on ?? todayInTimeZone(academy.timezone);
    const rows = await findOutstandingStudents(db, {
      academyId: academy.id,
      on,
      studentIds: await getStudentScope(db, member),
      teamId: query.teamId,
      limit: query.limit,
      cursor: query.cursor,
    });
    const kept = rows.slice(0, query.limit);
    const ids = kept.map((row) => row.id);
    const [standing, teams] = await Promise.all([
      loadPaymentStanding(db, academy.id, ids, on),
      loadStudentTeams(db, academy.id, ids),
    ]);
    const page = toPage(rows, query.limit, encodeOutstandingCursor, (row) => ({
      student: {
        id: row.id,
        name: row.name,
        email: row.email,
        image: row.image,
      },
      teams: teams.get(row.id) ?? [],
      ...standing.get(row.id),
    }));
    return json({ on, ...page });
  });

export const listOutstandingFees = listOutstandingFeesFor(feeReader);

// ---------------------------------------------------------------------------
// POST /fees/:id/void

export const voidFee = apiHandler(async (ctx) => {
  const { session, academy } = await requireAcademyAccess(ctx, {
    fee: ["void"],
  });
  const { id } = parseParams(feeIdParamsSchema, ctx.params);
  const input = parseBody(voidFeeSchema, await readJsonBody(ctx.request));
  const updated = await db.$transaction(async (tx) => {
    const before = await tx.fee.findFirst({
      where: { id, academyId: academy.id },
    });
    if (!before) {
      throw new NotFoundError("Fee not found");
    }
    // The conditional update makes a concurrent second void lose cleanly.
    const { count } = await tx.fee.updateMany({
      where: { id, academyId: academy.id, voidedAt: null },
      data: {
        voidedAt: new Date(),
        voidedById: session.user.id,
        voidReason: input.reason,
      },
    });
    if (count === 0) {
      throw new ConflictError("Fee already voided", { code: "already_voided" });
    }
    const after = await tx.fee.findUniqueOrThrow({ where: { id } });
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action: "fee.void",
      entityType: "fee",
      entityId: id,
      before,
      after,
      reason: input.reason,
    });
    return after;
  });
  return json({
    data: await serializeFeeRow(db, updated, todayInTimeZone(academy.timezone)),
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/me/fees

/** Where the student stands today, for "Paid up to 30 Nov" / "5 days overdue". */
const loadMySummary = async (
  academyId: string,
  studentId: string,
  today: string
) => {
  const outstanding = await findOutstandingStudents(db, {
    academyId,
    on: today,
    studentIds: [studentId],
    limit: 1,
  });
  const paidThrough = await db.fee.aggregate({
    where: {
      academyId,
      studentId,
      paidAt: { not: null },
      voidedAt: null,
    },
    _max: { periodEnd: true },
  });
  const latestEnd = paidThrough._max.periodEnd;
  const isOutstanding = outstanding.length > 0;
  const standing = isOutstanding
    ? (await loadPaymentStanding(db, academyId, [studentId], today)).get(
        studentId
      )
    : undefined;
  return {
    on: today,
    paidThrough: latestEnd ? toPlainDate(latestEnd) : null,
    isOutstanding,
    overdueSince: standing?.overdueSince ?? null,
    daysOverdue: standing?.daysOverdue ?? null,
    currentFee: standing?.currentFee ?? null,
  };
};

export const listMyFees = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  // Membership before validating the rest, so non-members get 404 not 400.
  const academyId = idSchema.safeParse(
    new URL(request.url).searchParams.get("academyId")
  );
  if (!academyId.success) {
    throw new ValidationError("academyId is required", {
      code: "academy_id_required",
    });
  }
  const { member, academy } = await requireAcademyMember(
    session,
    academyId.data
  );
  requirePermission(member, { fee: ["read"] });
  if (!member.isStudent) {
    throw new ForbiddenError("Only students have fees", {
      code: "not_a_student",
    });
  }
  const query = parseQuery(myFeesQuerySchema, request);
  requireValidRange(query);
  const today = todayInTimeZone(academy.timezone);
  const where: Prisma.FeeWhereInput = {
    AND: [
      { academyId: academy.id, studentId: session.user.id },
      periodOverlapWhere(query),
    ],
  };
  const [page, summary] = await Promise.all([
    loadFeePage(where, query, today),
    loadMySummary(academy.id, session.user.id, today),
  ]);
  return json({ ...page, summary });
});
