/**
 * Calendar events.
 *
 * GET    /api/v1/academies/:academyId/events       members (event:read), one item per session day
 * GET    /api/v1/academies/:academyId/events/:id   members who can see it
 * POST   /api/v1/academies/:academyId/events       academy admin (any), coach (own teams, teamId required)
 * PATCH  /api/v1/academies/:academyId/events/:id   academy admin, or a coach on the event's team
 * DELETE /api/v1/academies/:academyId/events/:id   same; refused once the event has attendance rows
 *
 * Session items carry `checkInOpensAt` / `checkInClosesAt` (./events-shared.ts
 * `serializeSession`). The platform owner reads GET /events and /events/:id
 * through ./admin-academy-views.ts (same code, read-only member).
 *
 * Visibility and edit rights are explained in ./events-shared.ts.
 * Sessions and session cancel are in ./events-sessions.ts.
 */
import { Prisma } from "@hoops-genesis/db/prisma";
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccessResolver,
  academyAccessWith,
  requireAcademyAccess,
} from "../access";
import { writeAuditLog } from "../audit";
import { EVENT_TYPES } from "../config/event-types";
import { ConflictError, ForbiddenError, ValidationError } from "../errors";
import {
  type ApiHandler,
  apiHandler,
  created,
  json,
  noContent,
} from "../handler";
import {
  decodeCursor,
  encodeCursor,
  paginationQueryShape,
  toPage,
} from "../pagination";
import { fromPlainDate, toEventDates, toNullableTimeOfDay } from "../serialize";
import { daysBetween, listSessionDates } from "../time";
import {
  idSchema,
  isoDateSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
  timeOfDaySchema,
} from "../validation";
import {
  assertCanManageEvent,
  assertCanUseTeam,
  type EventFields,
  type EventRow,
  findVisibleEvent,
  getVisibleTeams,
  hasLiveAttendance,
  lockEvent,
  normalizeEventFields,
  serializeEvent,
  serializeSession,
  toEventData,
  toEventFields,
  type VisibleTeams,
  visibleEventsWhere,
} from "./events-shared";

/** `GET /events` accepts at most this many days, `from` and `to` included. */
export const MAX_EVENT_LIST_DAYS = 92;
const MAX_TITLE_LENGTH = 200;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_LOCATION_LENGTH = 300;
const MAX_EVENT_TYPE_LENGTH = 64;
const MAX_EXCLUDED_DATES = 366;
const FK_VIOLATION = "P2003";

const eventIdParamsSchema = z.object({ id: idSchema });

const booleanQuerySchema = z
  .enum(["true", "false"])
  .optional()
  .transform((value) => value === "true");

const listQuerySchema = z.object({
  ...paginationQueryShape,
  from: isoDateSchema,
  to: isoDateSchema,
  teamId: idSchema.optional(),
  // Reads accept any type, so events of a type since removed from config can
  // still be found.
  eventType: z.string().trim().min(1).max(MAX_EVENT_TYPE_LENGTH).optional(),
  /** Also return cancelled days (excludedDates), with `cancelled: true`. */
  includeCancelled: booleanQuerySchema,
});

const nullableText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => (value === "" ? null : value));

const fieldShape = {
  title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
  eventType: z.enum(EVENT_TYPES),
  description: nullableText(MAX_DESCRIPTION_LENGTH),
  location: nullableText(MAX_LOCATION_LENGTH),
  teamId: idSchema.nullable(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  startTime: timeOfDaySchema.nullable(),
  endTime: timeOfDaySchema.nullable(),
  excludedDates: z.array(isoDateSchema).max(MAX_EXCLUDED_DATES),
  collectAttendance: z.boolean(),
};

const createBodySchema = z.object({
  title: fieldShape.title,
  eventType: fieldShape.eventType,
  startDate: fieldShape.startDate,
  description: fieldShape.description.optional(),
  location: fieldShape.location.optional(),
  teamId: fieldShape.teamId.optional(),
  endDate: fieldShape.endDate.optional(),
  startTime: fieldShape.startTime.optional(),
  endTime: fieldShape.endTime.optional(),
  excludedDates: fieldShape.excludedDates.optional(),
  collectAttendance: fieldShape.collectAttendance.optional(),
});

const patchBodySchema = z.object({
  title: fieldShape.title.optional(),
  eventType: fieldShape.eventType.optional(),
  description: fieldShape.description.optional(),
  location: fieldShape.location.optional(),
  teamId: fieldShape.teamId.optional(),
  startDate: fieldShape.startDate.optional(),
  endDate: fieldShape.endDate.optional(),
  startTime: fieldShape.startTime.optional(),
  endTime: fieldShape.endTime.optional(),
  excludedDates: fieldShape.excludedDates.optional(),
  collectAttendance: fieldShape.collectAttendance.optional(),
});

/** Fields that fix when sessions happen, and so who attended what. */
const SCHEDULE_FIELDS = [
  "startDate",
  "endDate",
  "startTime",
  "endTime",
  "teamId",
] as const satisfies readonly (keyof EventFields)[];

const attendanceExists = (message: string): ConflictError =>
  new ConflictError(message, { code: "attendance_exists" });

// ---------------------------------------------------------------- list

/** Sort key of one occurrence: date, start time ("" = all-day first), id. */
type OccurrenceKey = [string, string, string];

const occurrenceCursorSchema = z.tuple([z.string(), z.string(), z.string()]);

const compareKeys = (a: OccurrenceKey, b: OccurrenceKey): number => {
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return a[index] < b[index] ? -1 : 1;
    }
  }
  return 0;
};

interface Occurrence {
  cancelled: boolean;
  date: string;
  event: EventRow;
  key: OccurrenceKey;
}

const toOccurrences = (
  event: EventRow,
  range: { from: string; to: string },
  includeCancelled: boolean
): Occurrence[] => {
  const dates = toEventDates(event);
  const timeKey = toNullableTimeOfDay(event.startTime) ?? "";
  const sessionDays = listSessionDates(dates, range.from, range.to).map(
    (date) => ({ date, cancelled: false })
  );
  const cancelledDays = includeCancelled
    ? dates.excludedDates
        .filter((date) => date >= range.from && date <= range.to)
        .map((date) => ({ date, cancelled: true }))
    : [];
  return [...sessionDays, ...cancelledDays].map(({ date, cancelled }) => ({
    date,
    cancelled,
    event,
    key: [date, timeKey, event.id],
  }));
};

/**
 * `?teamId=`: academy admins may filter by any team (an unknown one just
 * matches nothing); anyone else only by a team they are on (403).
 */
const assertCanFilterByTeam = (teams: VisibleTeams, teamId: string): void => {
  if (teams === "all" || teams.includes(teamId)) {
    return;
  }
  throw new ForbiddenError("You can only filter by your own teams", {
    code: "not_on_team",
  });
};

const eventReader = academyAccessWith({ event: ["read"] });

/** GET /events for `resolve`'s caller (a member, or the platform owner). */
export const listEventsFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const query = parseQuery(listQuerySchema, ctx.request);
    if (query.from > query.to) {
      throw new ValidationError("from must be on or before to", {
        code: "invalid_range",
      });
    }
    if (daysBetween(query.from, query.to) + 1 > MAX_EVENT_LIST_DAYS) {
      throw new ValidationError(
        `from..to can span at most ${MAX_EVENT_LIST_DAYS} days`,
        { code: "range_too_long" }
      );
    }
    const after = query.cursor
      ? (decodeCursor(query.cursor, occurrenceCursorSchema) as OccurrenceKey)
      : null;
    const teams = await getVisibleTeams(db, member);
    if (query.teamId) {
      assertCanFilterByTeam(teams, query.teamId);
    }
    const from = fromPlainDate(query.from);
    const to = fromPlainDate(query.to);
    const events = await db.calendarEvent.findMany({
      where: {
        AND: [
          { academyId: academy.id },
          visibleEventsWhere(teams),
          query.teamId ? { teamId: query.teamId } : {},
          query.eventType ? { eventType: query.eventType } : {},
          // Overlaps from..to: starts by `to`, and ends (or, same-day, starts) on or after `from`.
          { startDate: { lte: to } },
          {
            OR: [
              { endDate: { gte: from } },
              { endDate: null, startDate: { gte: from } },
            ],
          },
        ],
      },
    });
    // A range is at most 92 days, so the occurrences are expanded and sorted in
    // memory; the cursor is the last occurrence's sort key.
    const occurrences = events
      .flatMap((event) => toOccurrences(event, query, query.includeCancelled))
      .filter((occurrence) => !after || compareKeys(occurrence.key, after) > 0)
      .sort((a, b) => compareKeys(a.key, b.key))
      .slice(0, query.limit + 1);
    return json(
      toPage(
        occurrences,
        query.limit,
        (occurrence) => encodeCursor(occurrence.key),
        ({ event, date, cancelled }) => ({
          ...serializeEvent(event),
          ...serializeSession(event, date, academy.timezone, cancelled),
        })
      )
    );
  });

export const listEvents = listEventsFor(eventReader);

// ---------------------------------------------------------------- read

/** GET /events/:id for `resolve`'s caller. */
export const getEventFor = (resolve: AcademyAccessResolver): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member } = await resolve(ctx);
    const { id } = parseParams(eventIdParamsSchema, ctx.params);
    const event = await findVisibleEvent(db, member, id);
    return json({ data: serializeEvent(event) });
  });

export const getEvent = getEventFor(eventReader);

// ---------------------------------------------------------------- create

export const createEvent = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    event: ["create"],
  });
  const input = parseBody(createBodySchema, await readJsonBody(ctx.request));
  const fields = normalizeEventFields({
    title: input.title,
    eventType: input.eventType,
    description: input.description ?? null,
    location: input.location ?? null,
    teamId: input.teamId ?? null,
    startDate: input.startDate,
    endDate: input.endDate ?? null,
    startTime: input.startTime ?? null,
    endTime: input.endTime ?? null,
    excludedDates: input.excludedDates ?? [],
    collectAttendance: input.collectAttendance ?? false,
  });
  await assertCanUseTeam(db, member, fields.teamId);
  const event = await db.calendarEvent.create({
    data: {
      ...toEventData(fields),
      academyId: academy.id,
      createdById: session.user.id,
    },
  });
  return created({ data: serializeEvent(event) });
});

// ---------------------------------------------------------------- update

export const updateEvent = apiHandler(async (ctx) => {
  const { member, academy } = await requireAcademyAccess(ctx, {
    event: ["update"],
  });
  const { id } = parseParams(eventIdParamsSchema, ctx.params);
  const input = parseBody(patchBodySchema, await readJsonBody(ctx.request));
  if (Object.keys(input).length === 0) {
    throw new ValidationError("Send at least one field to change", {
      code: "empty_update",
    });
  }
  const updated = await db.$transaction(async (tx) => {
    // Held until commit: attendance inserts for this event wait on it, so
    // the attendance checks below stay true until the update lands.
    await lockEvent(tx, academy.id, id);
    const before = await findVisibleEvent(tx, member, id);
    await assertCanManageEvent(tx, member, before);
    const current = toEventFields(before);
    const next = normalizeEventFields({ ...current, ...input });
    if (next.teamId !== current.teamId) {
      await assertCanUseTeam(tx, member, next.teamId);
    }
    const scheduleChanged = SCHEDULE_FIELDS.some(
      (field) => next[field] !== current[field]
    );
    if (scheduleChanged && (await hasLiveAttendance(tx, before))) {
      throw attendanceExists(
        "This event has attendance, so its dates, times and team can no longer change"
      );
    }
    const newlyExcluded = next.excludedDates
      .filter((date) => !current.excludedDates.includes(date))
      .map(fromPlainDate);
    if (
      newlyExcluded.length > 0 &&
      (await hasLiveAttendance(tx, before, newlyExcluded))
    ) {
      throw attendanceExists("A day you are excluding already has attendance");
    }
    return tx.calendarEvent.update({
      where: { id },
      data: { ...toEventData(next), updatedAt: new Date() },
    });
  });
  return json({ data: serializeEvent(updated) });
});

// ---------------------------------------------------------------- delete

export const deleteEvent = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    event: ["delete"],
  });
  const { id } = parseParams(eventIdParamsSchema, ctx.params);
  try {
    await db.$transaction(async (tx) => {
      await lockEvent(tx, academy.id, id);
      const before = await findVisibleEvent(tx, member, id);
      await assertCanManageEvent(tx, member, before);
      // The foreign key refuses the delete while any attendance row (voided
      // or not) points at the event; say so instead of failing on it.
      const attendance = await tx.attendance.findFirst({
        where: { eventId: id, academyId: academy.id },
        select: { id: true },
      });
      if (attendance) {
        throw attendanceExists(
          "This event has attendance records and cannot be deleted; cancel its remaining sessions instead"
        );
      }
      await writeAuditLog(tx, {
        request: ctx.request,
        session,
        academyId: academy.id,
        action: "event.delete",
        entityType: "calendar_event",
        entityId: id,
        before,
      });
      await tx.calendarEvent.delete({ where: { id } });
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === FK_VIOLATION
    ) {
      throw attendanceExists(
        "This event has attendance records and cannot be deleted"
      );
    }
    throw error;
  }
  return noContent();
});
