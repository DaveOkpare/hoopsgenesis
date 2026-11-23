/**
 * Shared pieces of the calendar event endpoints (./events.ts and
 * ./events-sessions.ts): serialization, who may see or manage an event, field
 * validation, and the row lock writes take.
 *
 * Who may see an event: academy admins see every event of the academy;
 * everyone else sees academy-wide events (teamId null) and the events of the
 * teams they are on. An event outside that is a 404, as if it did not exist.
 *
 * Who may change or delete an event (PATCH, DELETE): an academy admin, or any
 * coach on the event's team (API endpoints, Access by role: "Create, edit or
 * delete team events: Team"). A coach who has left the team loses both sight
 * of the event (404) and the right to change it. Academy-wide events are
 * admin-only, whoever created them.
 *
 * Who may cancel a session: an academy admin, or any coach on the event's
 * team.
 */
import type { Prisma, TransactionClient } from "@hoops-genesis/db/prisma";

import { ForbiddenError, NotFoundError, ValidationError } from "../errors";
import type { AcademyMember } from "../roles";
import { type DbClient, getTeamIdsForUser, isUserOnTeam } from "../scope";
import {
  fromPlainDate,
  fromTimeOfDay,
  toEventDates,
  toNullablePlainDate,
  toNullableTimeOfDay,
  toPlainDate,
  toTimestamp,
} from "../serialize";
import {
  daysBetween,
  MAX_SESSION_RANGE_DAYS,
  zonedDateTimeToUtc,
} from "../time";
import { getSessionWindow } from "./attendance-shared";

export type EventRow = Prisma.CalendarEventModel;

/** "all" for academy admins, else the ids of the teams the caller is on. */
export type VisibleTeams = "all" | readonly string[];

export const getVisibleTeams = async (
  client: DbClient,
  member: AcademyMember
): Promise<VisibleTeams> =>
  member.seesWholeAcademy
    ? "all"
    : await getTeamIdsForUser(client, member.academyId, member.userId);

export const canSeeEvent = (
  teams: VisibleTeams,
  event: Pick<EventRow, "teamId">
): boolean =>
  teams === "all" || event.teamId === null || teams.includes(event.teamId);

/** A Prisma filter for the events `teams` may see. */
export const visibleEventsWhere = (
  teams: VisibleTeams
): Prisma.CalendarEventWhereInput =>
  teams === "all"
    ? {}
    : { OR: [{ teamId: null }, { teamId: { in: [...teams] } }] };

/** The event, if it is in the academy and the caller may see it; else 404. */
export const findVisibleEvent = async (
  client: DbClient,
  member: AcademyMember,
  eventId: string
): Promise<EventRow> => {
  const event = await client.calendarEvent.findFirst({
    where: { id: eventId, academyId: member.academyId },
  });
  if (!event) {
    throw new NotFoundError("Event not found");
  }
  if (!canSeeEvent(await getVisibleTeams(client, member), event)) {
    throw new NotFoundError("Event not found");
  }
  return event;
};

/**
 * Locks the event row until the transaction ends, so concurrent writes to
 * the same event (two cancels appending to excluded_dates, an edit racing a
 * delete) run one after the other.
 */
export const lockEvent = async (
  tx: TransactionClient,
  academyId: string,
  eventId: string
): Promise<void> => {
  await tx.$queryRaw`
    SELECT id FROM calendar_event
    WHERE id = ${eventId} AND academy_id = ${academyId}
    FOR UPDATE
  `;
};

/** Is the caller a coach on `teamId` (a team of this academy)? */
export const isCoachOnTeam = async (
  client: DbClient,
  member: AcademyMember,
  teamId: string
): Promise<boolean> =>
  member.isCoach &&
  (await isUserOnTeam(client, member.academyId, member.userId, teamId));

/**
 * The team an event may be put on: it exists in the academy (404), and a
 * coach may only use their own teams (403). Academy-wide (null) is academy
 * admin only.
 */
export const assertCanUseTeam = async (
  client: DbClient,
  member: AcademyMember,
  teamId: string | null
): Promise<void> => {
  if (teamId === null) {
    if (!member.isAdmin) {
      throw new ForbiddenError(
        "Only academy admins create academy-wide events; choose one of your teams",
        { code: "team_required" }
      );
    }
    return;
  }
  const team = await client.team.findFirst({
    where: { id: teamId, organizationId: member.academyId },
    select: { id: true },
  });
  if (!team) {
    throw new NotFoundError("Team not found", { code: "team_not_found" });
  }
  if (!(member.isAdmin || (await isCoachOnTeam(client, member, teamId)))) {
    throw new ForbiddenError("You can only use teams you coach", {
      code: "not_on_team",
    });
  }
};

/** PATCH and DELETE: an academy admin, or a coach on the event's team. */
export const assertCanManageEvent = async (
  client: DbClient,
  member: AcademyMember,
  event: EventRow
): Promise<void> => {
  if (member.isAdmin) {
    return;
  }
  if (event.teamId === null) {
    throw new ForbiddenError(
      "Only academy admins can change academy-wide events"
    );
  }
  if (!(await isCoachOnTeam(client, member, event.teamId))) {
    throw new ForbiddenError("You no longer coach this event's team", {
      code: "not_on_team",
    });
  }
};

/** Session cancel: an academy admin, or any coach on the event's team. */
export const assertCanCancelSession = async (
  client: DbClient,
  member: AcademyMember,
  event: EventRow
): Promise<void> => {
  if (member.isAdmin) {
    return;
  }
  if (
    event.teamId === null ||
    !(await isCoachOnTeam(client, member, event.teamId))
  ) {
    throw new ForbiddenError(
      "Only a coach of the event's team or an academy admin can cancel a session"
    );
  }
};

/** Does any session of the event (or one of `dates`) have non-voided attendance? */
export const hasLiveAttendance = async (
  client: DbClient,
  event: Pick<EventRow, "id" | "academyId">,
  dates?: readonly Date[]
): Promise<boolean> => {
  const row = await client.attendance.findFirst({
    where: {
      eventId: event.id,
      academyId: event.academyId,
      voidedAt: null,
      ...(dates ? { sessionDate: { in: [...dates] } } : {}),
    },
    select: { id: true },
  });
  return row !== null;
};

/** An event's fields in API form (dates `YYYY-MM-DD`, times `HH:MM`). */
export interface EventFields {
  collectAttendance: boolean;
  description: string | null;
  endDate: string | null;
  endTime: string | null;
  eventType: string;
  excludedDates: string[];
  location: string | null;
  startDate: string;
  startTime: string | null;
  teamId: string | null;
  title: string;
}

export const toEventFields = (event: EventRow): EventFields => {
  const dates = toEventDates(event);
  return {
    title: event.title,
    eventType: event.eventType,
    description: event.description,
    location: event.location,
    teamId: event.teamId,
    startDate: dates.startDate,
    endDate: dates.endDate,
    startTime: toNullableTimeOfDay(event.startTime),
    endTime: toNullableTimeOfDay(event.endTime),
    excludedDates: [...dates.excludedDates],
    collectAttendance: event.collectAttendance,
  };
};

/** `08:00:00` and `08:00` are the same time; compare in one form. */
const normalizeTime = (value: string | null): string | null =>
  value === null ? null : toNullableTimeOfDay(fromTimeOfDay(value));

const invalid = (message: string, code: string): ValidationError =>
  new ValidationError(message, { code });

/**
 * Checks a whole event (as created, or as it would be after a PATCH) and
 * returns it normalized: a one-day `endDate` becomes null, times become
 * `HH:MM`, excluded dates are sorted and unique. Mirrors the database CHECKs
 * so the client gets a 400 with a clear code instead of a 500.
 */
export const normalizeEventFields = (fields: EventFields): EventFields => {
  const startTime = normalizeTime(fields.startTime);
  const endTime = normalizeTime(fields.endTime);
  const endDate =
    fields.endDate === null || fields.endDate === fields.startDate
      ? null
      : fields.endDate;
  const lastDate = endDate ?? fields.startDate;
  if (lastDate < fields.startDate) {
    throw invalid(
      "endDate must be on or after startDate",
      "invalid_date_range"
    );
  }
  if (daysBetween(fields.startDate, lastDate) >= MAX_SESSION_RANGE_DAYS) {
    throw invalid(
      `An event can last at most ${MAX_SESSION_RANGE_DAYS} days`,
      "event_too_long"
    );
  }
  if ((startTime === null) !== (endTime === null)) {
    throw invalid(
      "Give both startTime and endTime, or neither for an all-day event",
      "invalid_times"
    );
  }
  if (startTime !== null && endTime !== null && endTime <= startTime) {
    throw invalid("endTime must be after startTime", "invalid_times");
  }
  if (fields.collectAttendance && startTime === null) {
    throw invalid(
      "Taking attendance needs a startTime and endTime",
      "attendance_needs_times"
    );
  }
  const excludedDates = [...new Set(fields.excludedDates)].sort();
  if (
    excludedDates.some((date) => date < fields.startDate || date > lastDate)
  ) {
    throw invalid(
      "excludedDates must fall within the event's dates",
      "excluded_date_outside_event"
    );
  }
  return { ...fields, startTime, endTime, endDate, excludedDates };
};

/** Normalized fields to the Prisma data for a create or update. */
export const toEventData = (fields: EventFields) => ({
  title: fields.title,
  eventType: fields.eventType,
  description: fields.description,
  location: fields.location,
  teamId: fields.teamId,
  startDate: fromPlainDate(fields.startDate),
  endDate: fields.endDate === null ? null : fromPlainDate(fields.endDate),
  startTime: fields.startTime === null ? null : fromTimeOfDay(fields.startTime),
  endTime: fields.endTime === null ? null : fromTimeOfDay(fields.endTime),
  excludedDates: fields.excludedDates.map(fromPlainDate),
  collectAttendance: fields.collectAttendance,
});

export const serializeEvent = (event: EventRow) => ({
  id: event.id,
  academyId: event.academyId,
  teamId: event.teamId,
  eventType: event.eventType,
  title: event.title,
  description: event.description,
  location: event.location,
  startDate: toPlainDate(event.startDate),
  endDate: toNullablePlainDate(event.endDate),
  startTime: toNullableTimeOfDay(event.startTime),
  endTime: toNullableTimeOfDay(event.endTime),
  excludedDates: event.excludedDates.map(toPlainDate),
  collectAttendance: event.collectAttendance,
  createdById: event.createdById,
  createdAt: toTimestamp(event.createdAt),
  updatedAt: toTimestamp(event.updatedAt),
});

/**
 * One session (or cancelled day) of an event: its date plus the UTC instants
 * it starts and ends, or nulls for an all-day event. For an event that takes
 * attendance, `checkInOpensAt` / `checkInClosesAt` are the QR scan window
 * (the same one POST /attendance/scan enforces, SESSION_WINDOW in ../time.ts),
 * for "Check-in opens at 15:30" (ST-2); null when attendance is not collected
 * or the day is cancelled.
 */
export const serializeSession = (
  event: Pick<EventRow, "startTime" | "endTime" | "collectAttendance">,
  sessionDate: string,
  timeZone: string,
  cancelled: boolean
) => {
  const startTime = toNullableTimeOfDay(event.startTime);
  const endTime = toNullableTimeOfDay(event.endTime);
  const window =
    event.collectAttendance && !cancelled
      ? getSessionWindow(event, sessionDate, timeZone)
      : null;
  return {
    sessionDate,
    cancelled,
    startsAt:
      startTime === null
        ? null
        : toTimestamp(zonedDateTimeToUtc(sessionDate, startTime, timeZone)),
    endsAt:
      endTime === null
        ? null
        : toTimestamp(zonedDateTimeToUtc(sessionDate, endTime, timeZone)),
    checkInOpensAt: window ? toTimestamp(window.opensAt) : null,
    checkInClosesAt: window ? toTimestamp(window.closesAt) : null,
  };
};
