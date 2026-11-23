/**
 * Attendance (append-only). Paths are relative to
 * /api/v1/academies/:academyId unless they start with /api/v1.
 *
 * POST   /attendance                 coach of the event's team, academy admin (attendance:create)
 * GET    /attendance                 coach (own teams' students), academy admin (attendance:read)
 *        `?teamId=` means students on that team (as GET /fees), `?eventId=` one event
 * GET    /attendance/:id             same scope
 * POST   /attendance/:id/check-out   coach of the team, academy admin (attendance:update)
 * POST   /attendance/:id/void        academy admin (attendance:void)
 * POST   /attendance/:id/verify      coach of the team, academy admin (attendance:verify)
 * DELETE /attendance/:id/verify      same; only until the session window closes
 * POST   /attendance/verify          bulk tick, per-id results
 * GET    /api/v1/me/attendance       the signed-in student's own rows, voided ones left out
 *
 * The platform owner reads GET /attendance and GET /attendance/:id through
 * ./admin-academy-views.ts (same code, read-only member).
 *
 * Every row carries `student: { id, name, image }` and a `{ id, name }` next
 * to `recordedById`, `verifiedById` and `voidedById` (./attendance-shared.ts).
 *
 * The QR scan lives in ./scan.ts.
 */
import { Prisma, type TransactionClient } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccess,
  type AcademyAccessResolver,
  authenticate,
  requireAcademyAccess,
  requireAcademyMember,
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
  paginationQueryShape,
  timeIdKeysetWhere,
  toPage,
} from "../pagination";
import { loadPeople } from "../people";
import { type AcademyMember, parseRoles } from "../roles";
import {
  canSeeStudent,
  getStudentIdsForCoach,
  getStudentScope,
  isUserOnTeam,
  requireVisibleTeam,
} from "../scope";
import {
  fromPlainDate,
  plainDateRange,
  toEventDates,
  toPlainDate,
} from "../serialize";
import { isSessionDate, todayInTimeZone } from "../time";
import {
  idSchema,
  isoDateSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
  timestampSchema,
} from "../validation";
import {
  ATTENDANCE_STATUSES,
  type AttendanceRow,
  attendanceClock,
  attendancePeopleIds,
  canManageAttendance,
  findAttendanceInScope,
  findEventForAttendanceWrite,
  getSessionWindow,
  type SerializedAttendance,
  type SessionEvent,
  serializeAttendance,
  serializeAttendanceRow,
  serializeAttendanceRows,
  sessionEventSelect,
} from "./attendance-shared";

const MAX_ENTRIES = 200;
const MAX_NOTES_LENGTH = 1000;
const MAX_REASON_LENGTH = 500;
const MAX_BULK_VERIFY_IDS = 200;
const HTTP_CREATED = 201;
const HTTP_OK = 200;

const statusSchema = z.enum(ATTENDANCE_STATUSES);
const idParamsSchema = z.object({ id: idSchema });

// ---------------------------------------------------------------------------
// POST /attendance

const entrySchema = z
  .strictObject({
    studentId: idSchema,
    status: statusSchema,
    checkInAt: timestampSchema.optional(),
    notes: z.string().trim().min(1).max(MAX_NOTES_LENGTH).optional(),
  })
  .refine((entry) => !(entry.status === "absent" && entry.checkInAt), {
    message: "An absent student has no check-in time",
    path: ["checkInAt"],
  });

const createSchema = z.object({
  eventId: idSchema,
  sessionDate: isoDateSchema,
  entries: z
    .array(entrySchema)
    .min(1)
    .max(MAX_ENTRIES)
    .refine(
      (entries) =>
        new Set(entries.map((entry) => entry.studentId)).size ===
        entries.length,
      "Each student may appear only once"
    ),
});

type CreateInput = z.output<typeof createSchema>;

const isUniqueViolation = (error: unknown): boolean =>
  error instanceof Prisma.PrismaClientKnownRequestError &&
  error.code === "P2002";

/** The event of a manual entry, and the caller's right to record for it. */
const loadEventForRecording = async (
  tx: TransactionClient,
  member: AcademyMember,
  input: CreateInput,
  timeZone: string,
  now: Date
): Promise<SessionEvent> => {
  const event = await findEventForAttendanceWrite(
    tx,
    member.academyId,
    input.eventId
  );
  if (!event) {
    throw new NotFoundError("Event not found");
  }
  // Team event: a coach must be on that team. Academy-wide: checked per
  // student in checkStudentsForRecording.
  const mayRecord =
    member.isAdmin ||
    (member.isCoach &&
      (event.teamId === null ||
        (await isUserOnTeam(
          tx,
          member.academyId,
          member.userId,
          event.teamId
        ))));
  if (!mayRecord) {
    throw new ForbiddenError(
      "Only a coach of this team or an academy admin can record attendance"
    );
  }
  if (!event.collectAttendance) {
    throw new RuleViolationError("This event does not take attendance", {
      code: "attendance_not_collected",
    });
  }
  if (!isSessionDate(toEventDates(event), input.sessionDate)) {
    throw new RuleViolationError("This date is not a session of the event", {
      code: "not_a_session",
    });
  }
  if (input.sessionDate > todayInTimeZone(timeZone, now)) {
    throw new RuleViolationError(
      "Attendance cannot be recorded for a future session",
      { code: "session_in_future" }
    );
  }
  return event;
};

/** Every student is a student of the academy and, for team events, on the team. */
const checkStudentsForRecording = async (
  tx: TransactionClient,
  member: AcademyMember,
  event: SessionEvent,
  studentIds: string[]
): Promise<void> => {
  const members = await tx.member.findMany({
    where: { organizationId: member.academyId, userId: { in: studentIds } },
    select: { userId: true, role: true },
  });
  const studentMembers = new Set(
    members
      .filter((row) => parseRoles(row.role).includes("student"))
      .map((row) => row.userId)
  );
  const notInAcademy = studentIds.filter((id) => !studentMembers.has(id));
  if (notInAcademy.length > 0) {
    throw new RuleViolationError("Not a student of this academy", {
      code: "student_not_in_academy",
      details: { studentIds: notInAcademy },
    });
  }
  if (event.teamId) {
    const onTeam = await tx.teamMember.findMany({
      where: { teamId: event.teamId, userId: { in: studentIds } },
      select: { userId: true },
    });
    const onTeamIds = new Set(onTeam.map((row) => row.userId));
    const notOnTeam = studentIds.filter((id) => !onTeamIds.has(id));
    if (notOnTeam.length > 0) {
      throw new RuleViolationError("Not on this event's team", {
        code: "student_not_on_team",
        details: { studentIds: notOnTeam },
      });
    }
    return;
  }
  // Academy-wide event: a coach records only students on their own teams.
  if (!member.isAdmin) {
    const coached = new Set(
      await getStudentIdsForCoach(tx, member.academyId, member.userId)
    );
    const notCoached = studentIds.filter((id) => !coached.has(id));
    if (notCoached.length > 0) {
      throw new ForbiddenError("You can only record your own teams' students", {
        code: "not_coach_of_student",
        details: { studentIds: notCoached },
      });
    }
  }
};

const ALREADY_RECORDED = "already_recorded";

export const createAttendance = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    attendance: ["create"],
  });
  const body = await readJsonBody(ctx.request);
  const input = parseBody(createSchema, body);
  return withIdempotency(
    { request: ctx.request, userId: session.user.id, body, required: true },
    async (tx) => {
      const now = attendanceClock.now();
      const event = await loadEventForRecording(
        tx,
        member,
        input,
        academy.timezone,
        now
      );
      const studentIds = input.entries.map((entry) => entry.studentId);
      await checkStudentsForRecording(tx, member, event, studentIds);

      const sessionDate = fromPlainDate(input.sessionDate);
      const existing = await tx.attendance.findMany({
        where: {
          eventId: event.id,
          sessionDate,
          studentId: { in: studentIds },
          voidedAt: null,
        },
        select: { studentId: true },
      });
      if (existing.length > 0) {
        throw new ConflictError("Attendance is already recorded", {
          code: ALREADY_RECORDED,
          details: { studentIds: existing.map((row) => row.studentId) },
        });
      }
      for (const entry of input.entries) {
        if (entry.checkInAt && entry.checkInAt > now) {
          throw new RuleViolationError("checkInAt is in the future", {
            code: "check_in_in_future",
            details: { studentId: entry.studentId },
          });
        }
      }

      // Present / late without a time: checked in now, if the session is today.
      const isToday =
        input.sessionDate === todayInTimeZone(academy.timezone, now);
      const defaultCheckIn = (status: string): Date | null =>
        isToday && (status === "present" || status === "late") ? now : null;

      let rows: AttendanceRow[];
      try {
        rows = await tx.attendance.createManyAndReturn({
          data: input.entries.map((entry) => ({
            academyId: academy.id,
            eventId: event.id,
            sessionDate,
            studentId: entry.studentId,
            status: entry.status,
            checkInAt: entry.checkInAt ?? defaultCheckIn(entry.status),
            notes: entry.notes ?? null,
            recordedById: session.user.id,
          })),
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new ConflictError("Attendance is already recorded", {
            code: ALREADY_RECORDED,
            cause: error,
          });
        }
        throw error;
      }
      return {
        status: HTTP_CREATED,
        body: { data: await serializeAttendanceRows(tx, rows) },
      };
    }
  );
});

// ---------------------------------------------------------------------------
// GET /attendance, GET /attendance/:id, GET /api/v1/me/attendance

const listQuerySchema = z.object({
  ...paginationQueryShape,
  date: isoDateSchema.optional(),
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
  eventId: idSchema.optional(),
  teamId: idSchema.optional(),
  studentId: idSchema.optional(),
  status: statusSchema.optional(),
});

const meQuerySchema = z.object({
  ...paginationQueryShape,
  academyId: idSchema,
  from: isoDateSchema.optional(),
  to: isoDateSchema.optional(),
});

const sessionDateFilter = (range: {
  date?: string;
  from?: string;
  to?: string;
}): Prisma.AttendanceWhereInput => {
  if (range.date && (range.from || range.to)) {
    throw new ValidationError("Use date, or from and to, not both", {
      code: "invalid_range",
    });
  }
  if (range.from && range.to && range.from > range.to) {
    throw new ValidationError("from must be on or before to", {
      code: "invalid_range",
    });
  }
  if (range.date) {
    return { sessionDate: fromPlainDate(range.date) };
  }
  if (range.from || range.to) {
    return { sessionDate: plainDateRange(range) };
  }
  return {};
};

/** Newest session first. Staff lists include voided rows (clients strike them through). */
const listPage = async (
  where: Prisma.AttendanceWhereInput,
  { limit, cursor }: { limit: number; cursor?: string }
): Promise<Response> => {
  const rows = await db.attendance.findMany({
    where: { AND: [where, timeIdKeysetWhere("sessionDate", cursor, "desc")] },
    orderBy: [{ sessionDate: "desc" }, { id: "desc" }],
    take: limit + 1,
  });
  const people = await loadPeople(db, attendancePeopleIds(rows));
  return json(
    toPage(
      rows,
      limit,
      (row) => encodeTimeIdCursor(row.sessionDate, row.id),
      (row) => serializeAttendance(row, people)
    )
  );
};

/** Coaches and academy admins; a student-only member uses /api/v1/me/attendance. */
const requireAttendanceViewer = async (
  ctx: Parameters<typeof requireAcademyAccess>[0]
): Promise<AcademyAccess> => {
  const access = await requireAcademyAccess(ctx, { attendance: ["read"] });
  if (!(access.member.seesWholeAcademy || access.member.isCoach)) {
    throw new ForbiddenError(
      "Students see their own attendance at /api/v1/me/attendance"
    );
  }
  return access;
};

/** GET /attendance for `resolve`'s caller (a member, or the platform owner). */
export const listAttendanceFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const query = parseQuery(listQuerySchema, ctx.request);
    if (query.teamId) {
      await requireVisibleTeam(db, member, query.teamId);
    }
    const scope = await getStudentScope(db, member);
    const filters: Prisma.AttendanceWhereInput[] = [
      {
        academyId: academy.id,
        ...(scope === "all" ? {} : { studentId: { in: [...scope] } }),
        ...sessionDateFilter(query),
        ...(query.eventId ? { eventId: query.eventId } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
    ];
    // Narrow, never widen: AND keeps the scope filter on studentId.
    if (query.studentId) {
      filters.push({ studentId: query.studentId });
    }
    // Students on that team now (as GET /fees?teamId=), at any event.
    if (query.teamId) {
      filters.push({
        student: { teammembers: { some: { teamId: query.teamId } } },
      });
    }
    return listPage({ AND: filters }, query);
  });

/** GET /attendance/:id for `resolve`'s caller. */
export const getAttendanceFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member } = await resolve(ctx);
    const { id } = parseParams(idParamsSchema, ctx.params);
    const row = await findAttendanceInScope(db, member, id, { manage: false });
    return json({ data: await serializeAttendanceRow(db, row) });
  });

export const listAttendance = listAttendanceFor(requireAttendanceViewer);
export const getAttendance = getAttendanceFor(requireAttendanceViewer);

export const listMyAttendance = apiHandler(async ({ request }) => {
  const session = await authenticate(request);
  const rawAcademyId = new URL(request.url).searchParams.get("academyId");
  const academyId = idSchema.safeParse(rawAcademyId);
  if (!academyId.success) {
    throw new ValidationError("academyId is required", {
      code: "academy_id_required",
    });
  }
  const { member, academy } = await requireAcademyMember(
    session,
    academyId.data
  );
  if (!member.isStudent) {
    throw new ForbiddenError("Only students have their own attendance");
  }
  const query = parseQuery(meQuerySchema, request);
  // Voided rows "stay but are ignored" (schema): the student never sees them.
  return listPage(
    {
      academyId: academy.id,
      studentId: session.user.id,
      voidedAt: null,
      ...sessionDateFilter(query),
    },
    query
  );
});

// ---------------------------------------------------------------------------
// POST /attendance/:id/check-out

const checkOutSchema = z.object({ checkOutAt: timestampSchema.optional() });

export const checkOutAttendance = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    attendance: ["update"],
  });
  const { id } = parseParams(idParamsSchema, ctx.params);
  const input = parseBody(checkOutSchema, await readJsonBody(ctx.request));
  const updated = await db.$transaction(async (tx) => {
    const before = await findAttendanceInScope(tx, member, id, {
      manage: true,
    });
    if (before.voidedAt) {
      throw new ConflictError("This attendance was voided", {
        code: "already_voided",
      });
    }
    if (before.checkOutAt) {
      throw new ConflictError("Already checked out", {
        code: "already_checked_out",
      });
    }
    if (!before.checkInAt) {
      throw new RuleViolationError("There is no check-in to check out from", {
        code: "not_checked_in",
      });
    }
    const now = attendanceClock.now();
    const checkOutAt = input.checkOutAt ?? now;
    if (checkOutAt > now) {
      throw new RuleViolationError("checkOutAt is in the future", {
        code: "check_out_in_future",
      });
    }
    if (checkOutAt < before.checkInAt) {
      throw new RuleViolationError("checkOutAt is before the check-in", {
        code: "check_out_before_check_in",
      });
    }
    // Guarded update: a concurrent check-out leaves 0 rows to change.
    const { count } = await tx.attendance.updateMany({
      where: { id, academyId: academy.id, checkOutAt: null, voidedAt: null },
      data: { checkOutAt },
    });
    if (count === 0) {
      throw new ConflictError("Already checked out", {
        code: "already_checked_out",
      });
    }
    const after = await tx.attendance.findUniqueOrThrow({ where: { id } });
    const { event: _event, ...beforeRow } = before;
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action: "attendance.check_out",
      entityType: "attendance",
      entityId: id,
      before: beforeRow,
      after,
    });
    return after;
  });
  return json({ data: await serializeAttendanceRow(db, updated) });
});

// ---------------------------------------------------------------------------
// POST /attendance/:id/void

const voidSchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH),
});

export const voidAttendance = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    attendance: ["void"],
  });
  const { id } = parseParams(idParamsSchema, ctx.params);
  const input = parseBody(voidSchema, await readJsonBody(ctx.request));
  const updated = await db.$transaction(async (tx) => {
    const { event: _event, ...before } = await findAttendanceInScope(
      tx,
      member,
      id,
      { manage: true }
    );
    if (before.voidedAt) {
      throw new ConflictError("Already voided", { code: "already_voided" });
    }
    const { count } = await tx.attendance.updateMany({
      where: { id, academyId: academy.id, voidedAt: null },
      data: {
        voidedAt: attendanceClock.now(),
        voidedById: session.user.id,
        voidReason: input.reason,
      },
    });
    if (count === 0) {
      throw new ConflictError("Already voided", { code: "already_voided" });
    }
    const after = await tx.attendance.findUniqueOrThrow({ where: { id } });
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action: "attendance.void",
      entityType: "attendance",
      entityId: id,
      before,
      after,
      reason: input.reason,
    });
    return after;
  });
  return json({ data: await serializeAttendanceRow(db, updated) });
});

// ---------------------------------------------------------------------------
// POST/DELETE /attendance/:id/verify, POST /attendance/verify

type VerifyOutcome = "verified" | "unchanged";

/** Ticks one row the caller may manage. Already ticked: unchanged, no audit. */
const tickRow = async (
  tx: TransactionClient,
  access: AcademyAccess,
  request: Request,
  before: AttendanceRow
): Promise<{ outcome: VerifyOutcome; row: AttendanceRow }> => {
  if (before.voidedAt) {
    throw new ConflictError("This attendance was voided", {
      code: "already_voided",
    });
  }
  if (before.verifiedAt) {
    return { outcome: "unchanged", row: before };
  }
  const { count } = await tx.attendance.updateMany({
    where: { id: before.id, verifiedAt: null, voidedAt: null },
    data: {
      verifiedAt: attendanceClock.now(),
      verifiedById: access.session.user.id,
    },
  });
  const after = await tx.attendance.findUniqueOrThrow({
    where: { id: before.id },
  });
  if (count === 0) {
    // Ticked (or voided) by someone else a moment ago.
    if (after.voidedAt) {
      throw new ConflictError("This attendance was voided", {
        code: "already_voided",
      });
    }
    return { outcome: "unchanged", row: after };
  }
  await writeAuditLog(tx, {
    request,
    session: access.session,
    academyId: access.academy.id,
    action: "attendance.verify",
    entityType: "attendance",
    entityId: before.id,
    before,
    after,
  });
  return { outcome: "verified", row: after };
};

export const verifyAttendance = apiHandler(async (ctx) => {
  const access = await requireAcademyAccess(ctx, { attendance: ["verify"] });
  const { id } = parseParams(idParamsSchema, ctx.params);
  const { row } = await db.$transaction(async (tx) => {
    const { event: _event, ...before } = await findAttendanceInScope(
      tx,
      access.member,
      id,
      { manage: true }
    );
    return tickRow(tx, access, ctx.request, before);
  });
  return json({ data: await serializeAttendanceRow(db, row) });
});

export const unverifyAttendance = apiHandler(async (ctx) => {
  const access = await requireAcademyAccess(ctx, { attendance: ["verify"] });
  const { id } = parseParams(idParamsSchema, ctx.params);
  const row = await db.$transaction(async (tx) => {
    const { event, ...before } = await findAttendanceInScope(
      tx,
      access.member,
      id,
      { manage: true }
    );
    if (before.voidedAt) {
      throw new ConflictError("This attendance was voided", {
        code: "already_voided",
      });
    }
    if (!before.verifiedAt) {
      return before;
    }
    const window = getSessionWindow(
      event,
      toPlainDate(before.sessionDate),
      access.academy.timezone
    );
    if (attendanceClock.now() > window.closesAt) {
      throw new ConflictError(
        "The session window has closed; the tick can no longer be removed",
        { code: "window_closed", details: { closesAt: window.closesAt } }
      );
    }
    const { count } = await tx.attendance.updateMany({
      where: { id, verifiedAt: { not: null } },
      data: { verifiedAt: null, verifiedById: null },
    });
    const after = await tx.attendance.findUniqueOrThrow({ where: { id } });
    if (count > 0) {
      await writeAuditLog(tx, {
        request: ctx.request,
        session: access.session,
        academyId: access.academy.id,
        action: "attendance.unverify",
        entityType: "attendance",
        entityId: id,
        before,
        after,
      });
    }
    return after;
  });
  return json({ data: await serializeAttendanceRow(db, row) });
});

const bulkVerifySchema = z.object({
  ids: z
    .array(idSchema)
    .min(1)
    .max(MAX_BULK_VERIFY_IDS)
    .refine(
      (ids) => new Set(ids).size === ids.length,
      "Each id may appear only once"
    ),
});

type BulkOutcome =
  | { id: string; result: VerifyOutcome; row: AttendanceRow }
  | { id: string; result: "not_found" | "forbidden" | "already_voided" };

type BulkResult =
  | { id: string; result: VerifyOutcome; data: SerializedAttendance }
  | { id: string; result: "not_found" | "forbidden" | "already_voided" };

/**
 * Ticks each id the caller may manage, in one transaction. Per-id results:
 * verified, unchanged (already ticked), already_voided, not_found (no such
 * row or outside the caller's scope), forbidden (visible but not theirs).
 */
export const bulkVerifyAttendance = apiHandler(async (ctx) => {
  const access = await requireAcademyAccess(ctx, { attendance: ["verify"] });
  const input = parseBody(bulkVerifySchema, await readJsonBody(ctx.request));
  const results = await db.$transaction(async (tx) => {
    const rows = await tx.attendance.findMany({
      where: { id: { in: input.ids }, academyId: access.academy.id },
      include: { event: { select: sessionEventSelect } },
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    const out: BulkOutcome[] = [];
    // One transaction holds one connection, so rows are checked in turn.
    for (const id of input.ids) {
      const found = byId.get(id);
      if (
        // biome-ignore lint/performance/noAwaitInLoops: sequential on one transaction
        !(found && (await canSeeStudent(tx, access.member, found.studentId)))
      ) {
        out.push({ id, result: "not_found" });
        continue;
      }
      const { event, ...before } = found;
      if (
        !(await canManageAttendance(tx, access.member, event, before.studentId))
      ) {
        out.push({ id, result: "forbidden" });
        continue;
      }
      if (before.voidedAt) {
        out.push({ id, result: "already_voided" });
        continue;
      }
      const { outcome, row } = await tickRow(tx, access, ctx.request, before);
      out.push({ id, result: outcome, row });
    }
    const ticked = out.flatMap((entry) => ("row" in entry ? [entry.row] : []));
    const people = await loadPeople(tx, attendancePeopleIds(ticked));
    return out.map(
      (entry): BulkResult =>
        "row" in entry
          ? {
              id: entry.id,
              result: entry.result,
              data: serializeAttendance(entry.row, people),
            }
          : entry
    );
  });
  return json({ data: results }, { status: HTTP_OK });
});
