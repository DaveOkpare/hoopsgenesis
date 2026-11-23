/**
 * Sessions of a calendar event. Sessions are not stored: a session is the
 * event on one of its dates (startDate..endDate minus excludedDates), local
 * to the academy's time zone.
 *
 * GET  /api/v1/academies/:academyId/events/:id/sessions              members who can see the event
 *      (also the platform owner's read-only view, ./admin-academy-views.ts);
 *      each session has `checkInOpensAt` / `checkInClosesAt`
 * POST /api/v1/academies/:academyId/events/:id/sessions/:date/cancel coach of the event's team, academy admin
 *
 * Cancel adds the date to excludedDates and writes audit_log
 * (`event.session_cancel`) in the same transaction. Refused when the date is
 * not a session (404 session_not_found), is already cancelled (409
 * already_cancelled), or the session has non-voided attendance (409
 * attendance_exists).
 */
import { z } from "zod";

import { db } from "../../../services";
import {
  type AcademyAccessResolver,
  academyAccessWith,
  requireAcademyAccess,
} from "../access";
import { writeAuditLog } from "../audit";
import { ConflictError, NotFoundError, ValidationError } from "../errors";
import { type ApiHandler, apiHandler, json } from "../handler";
import { fromPlainDate, toEventDates } from "../serialize";
import { isSessionDate, listSessionDates } from "../time";
import {
  idSchema,
  isoDateSchema,
  parseBody,
  parseParams,
  parseQuery,
  readJsonBody,
} from "../validation";
import {
  assertCanCancelSession,
  findVisibleEvent,
  hasLiveAttendance,
  lockEvent,
  serializeEvent,
  serializeSession,
} from "./events-shared";

const MAX_REASON_LENGTH = 500;

const eventIdParamsSchema = z.object({ id: idSchema });
const sessionParamsSchema = z.object({ id: idSchema, date: isoDateSchema });

const sessionsQuerySchema = z.object({
  /** Default: the event's first day. */
  from: isoDateSchema.optional(),
  /** Default: the event's last day. */
  to: isoDateSchema.optional(),
  /** Also return cancelled days, with `cancelled: true`. */
  includeCancelled: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => value === "true"),
});

const cancelBodySchema = z.object({
  reason: z.string().trim().min(1).max(MAX_REASON_LENGTH).optional(),
});

/** GET /events/:id/sessions for `resolve`'s caller. */
export const listEventSessionsFor = (
  resolve: AcademyAccessResolver
): ApiHandler =>
  apiHandler(async (ctx) => {
    const { member, academy } = await resolve(ctx);
    const { id } = parseParams(eventIdParamsSchema, ctx.params);
    const query = parseQuery(sessionsQuerySchema, ctx.request);
    const event = await findVisibleEvent(db, member, id);
    const dates = toEventDates(event);
    const from = query.from ?? dates.startDate;
    const to = query.to ?? dates.endDate ?? dates.startDate;
    if (from > to) {
      throw new ValidationError("from must be on or before to", {
        code: "invalid_range",
      });
    }
    // listSessionDates clamps the range to the event's own dates, and events
    // are at most MAX_SESSION_RANGE_DAYS long, so this is bounded.
    const sessions = listSessionDates(dates, from, to).map((date) => ({
      date,
      cancelled: false,
    }));
    const cancelled = query.includeCancelled
      ? dates.excludedDates
          .filter((date) => date >= from && date <= to)
          .map((date) => ({ date, cancelled: true }))
      : [];
    const data = [...sessions, ...cancelled]
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map(({ date, cancelled: isCancelled }) =>
        serializeSession(event, date, academy.timezone, isCancelled)
      );
    return json({ data });
  });

export const listEventSessions = listEventSessionsFor(
  academyAccessWith({ event: ["read"] })
);

export const cancelEventSession = apiHandler(async (ctx) => {
  const { session, member, academy } = await requireAcademyAccess(ctx, {
    event: ["update"],
  });
  const { id, date } = parseParams(sessionParamsSchema, ctx.params);
  const input = parseBody(cancelBodySchema, await readJsonBody(ctx.request));
  const updated = await db.$transaction(async (tx) => {
    // Serializes concurrent cancels (each rewrites excluded_dates) and holds
    // off attendance inserts for this event until commit.
    await lockEvent(tx, academy.id, id);
    const before = await findVisibleEvent(tx, member, id);
    await assertCanCancelSession(tx, member, before);
    const dates = toEventDates(before);
    if (dates.excludedDates.includes(date)) {
      throw new ConflictError("This session is already cancelled", {
        code: "already_cancelled",
      });
    }
    if (!isSessionDate(dates, date)) {
      throw new NotFoundError("The event has no session on that date", {
        code: "session_not_found",
      });
    }
    if (await hasLiveAttendance(tx, before, [fromPlainDate(date)])) {
      throw new ConflictError(
        "This session already has attendance, so it can no longer be cancelled",
        { code: "attendance_exists" }
      );
    }
    const after = await tx.calendarEvent.update({
      where: { id },
      data: {
        excludedDates: [...dates.excludedDates, date].sort().map(fromPlainDate),
        updatedAt: new Date(),
      },
    });
    await writeAuditLog(tx, {
      request: ctx.request,
      session,
      academyId: academy.id,
      action: "event.session_cancel",
      entityType: "calendar_event",
      entityId: id,
      before,
      after,
      reason: input.reason ?? null,
    });
    return after;
  });
  return json({ data: { ...serializeEvent(updated), cancelledDate: date } });
});
