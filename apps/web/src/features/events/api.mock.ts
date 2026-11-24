/* Preview-mode (fixture) implementation of features/events/api.ts. Dev only. */

import type {
  CreateEventInput,
  EventChanges,
  EventDay,
  EventDetail,
  EventKind,
  EventSessionItem,
  EventViewer,
} from "@/features/events/api";
import {
  alineRows,
  detailCancelNotes,
  detailEvents,
  detailTallies,
  detailTeams,
} from "@/features/events/fixtures";
import { fixtureDelay } from "@/features/fixtures";
import { calendarEvents } from "@/features/sessions/fixtures";
import {
  addDays,
  addMinutes,
  WINDOW_CLOSES_AFTER_MIN,
  WINDOW_OPENS_BEFORE_MIN,
  zonedInstant,
} from "@/features/sessions/time";
import { studentCalendarEvents } from "@/features/student-calendar/fixtures";
import type { CalendarEvent, DateOnly, Id } from "@/features/types";

/** The preview coach (Sharika). */
const PREVIEW_VIEWER = "user-sharika";
const PREVIEW_ZONE = "Africa/Kigali";
const NEXT_DATES = 3;

let nextId = 1;

/** Design events first, then the shared coach fixtures (Today, sessions). */
/** Design events, the coach fixtures, then the student calendar's (each id once). */
function allEvents(): CalendarEvent[] {
  const seen = new Set<Id>();
  return [...detailEvents, ...calendarEvents, ...studentCalendarEvents].filter(
    (e) => {
      if (seen.has(e.id)) {
        return false;
      }
      seen.add(e.id);
      return true;
    }
  );
}

function findEvent(eventId: Id): CalendarEvent | undefined {
  return allEvents().find((e) => e.id === eventId);
}

function sameSeries(a: CalendarEvent, b: CalendarEvent): boolean {
  return (
    a.endDate === null &&
    b.endDate === null &&
    a.title === b.title &&
    a.teamId === b.teamId &&
    a.eventType === b.eventType &&
    a.startTime === b.startTime &&
    a.endTime === b.endTime
  );
}

function datesOf(event: CalendarEvent): DateOnly[] {
  const last = event.endDate ?? event.startDate;
  const dates: DateOnly[] = [];
  for (let d = event.startDate; d <= last; d = addDays(d, 1)) {
    dates.push(d);
  }
  return dates;
}

interface Occurrence {
  cancelled: boolean;
  date: DateOnly;
  event: CalendarEvent;
}

function seriesOf(event: CalendarEvent): {
  kind: EventKind;
  occurrences: Occurrence[];
} {
  const members =
    event.endDate === null
      ? allEvents().filter((e) => e.id === event.id || sameSeries(e, event))
      : [event];
  const occurrences = members
    .flatMap((e) =>
      datesOf(e).map((date) => ({
        event: e,
        date,
        cancelled: e.excludedDates.includes(date),
      }))
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  let kind: EventKind = "single";
  if (event.endDate !== null) {
    kind = "days";
  } else if (members.length > 1) {
    kind = "series";
  }
  return { kind, occurrences };
}

function windowOf(event: CalendarEvent, date: DateOnly, cancelled: boolean) {
  if (
    !(event.collectAttendance && event.startTime && event.endTime) ||
    cancelled
  ) {
    return { opensAt: null, closesAt: null };
  }
  return {
    opensAt: addMinutes(
      zonedInstant(date, event.startTime, PREVIEW_ZONE),
      -WINDOW_OPENS_BEFORE_MIN
    ).toISOString(),
    closesAt: addMinutes(
      zonedInstant(date, event.endTime, PREVIEW_ZONE),
      WINDOW_CLOSES_AFTER_MIN
    ).toISOString(),
  };
}

export async function getEventDetail(
  viewer: EventViewer,
  eventId: Id
): Promise<EventDetail | null> {
  await fixtureDelay();
  const event = findEvent(eventId);
  if (!event) {
    return null;
  }
  const { kind, occurrences } = seriesOf(event);
  const team = event.teamId ? detailTeams[event.teamId] : undefined;
  const sessions: EventSessionItem[] = occurrences.map(
    ({ event: e, date, cancelled }) => {
      const key = `${e.id}:${date}`;
      const note = viewer.isAdmin ? detailCancelNotes[key] : undefined;
      const window = windowOf(e, date, cancelled);
      const counted =
        viewer.isStaff &&
        e.collectAttendance &&
        !cancelled &&
        date < viewer.today;
      return {
        eventId: e.id,
        date,
        cancelled,
        cancelledBy: note?.by ?? null,
        cancelReason: note?.reason ?? null,
        startTime: e.startTime,
        endTime: e.endTime,
        location: e.location,
        checkInOpensAt: window.opensAt,
        checkInClosesAt: window.closesAt,
        tally: counted
          ? (detailTallies[key] ?? {
              present: 0,
              late: 0,
              absent: 0,
              excused: 0,
              notMarked: team?.studentCount ?? null,
            })
          : null,
      };
    }
  );
  const creator =
    team?.coaches.find((c) => c.id === event.createdBy)?.name ??
    (event.createdBy === "user-sharika" ? "Sharika D." : null);
  return {
    event: { ...event },
    kind,
    seriesEventIds: [...new Set(occurrences.map((o) => o.event.id))],
    sessions,
    team:
      event.teamId && team
        ? { id: event.teamId, name: team.name, studentCount: team.studentCount }
        : null,
    coaches: team?.coaches.map((c) => c.name) ?? [],
    creatorName: creator,
    timeZone: viewer.timeZone,
  };
}

export async function getEventDay(
  viewer: Pick<EventViewer, "academyId" | "today">,
  eventId: Id,
  date: DateOnly | undefined
): Promise<EventDay | null> {
  await fixtureDelay();
  const event = findEvent(eventId);
  if (!event) {
    return null;
  }
  const { kind, occurrences } = seriesOf(event);
  const own = occurrences.filter((o) => o.event.id === event.id);
  const day = date
    ? own.find((o) => o.date === date)
    : (own.find((o) => o.date >= viewer.today) ?? own.at(-1));
  if (!day) {
    return null;
  }
  const team = event.teamId ? detailTeams[event.teamId] : undefined;
  const window = windowOf(event, day.date, day.cancelled);
  const row = alineRows.find(
    (r) => r.eventId === event.id && r.sessionDate === day.date
  );
  return {
    event: { ...event },
    kind,
    date: day.date,
    cancelled: day.cancelled,
    checkInOpensAt: window.opensAt,
    checkInClosesAt: window.closesAt,
    teamName: team?.name ?? null,
    coachName:
      team?.coaches.find((c) => c.id !== "user-sharika")?.name ??
      team?.coaches[0]?.name ??
      null,
    attendance: row ?? null,
    seriesDates: occurrences.map((o) => o.date),
    nextDates: occurrences
      .filter((o) => o.date > day.date)
      .slice(0, NEXT_DATES)
      .map((o) => ({
        eventId: o.event.id,
        date: o.date,
        cancelled: o.cancelled,
      })),
  };
}

export async function createEvents(
  academyId: Id,
  input: { event: CreateEventInput; dates: DateOnly[] }
): Promise<CalendarEvent[]> {
  await fixtureDelay();
  const now = new Date().toISOString();
  const created = input.dates.map((startDate) => {
    const event: CalendarEvent = {
      id: `event-new-${nextId}`,
      academyId,
      teamId: input.event.teamId,
      eventType: input.event.eventType,
      title: input.event.title,
      description: input.event.description ?? null,
      location: input.event.location,
      startDate,
      endDate: input.event.endDate ?? null,
      startTime: input.event.startTime,
      endTime: input.event.endTime,
      excludedDates: [],
      collectAttendance: input.event.collectAttendance,
      createdBy: PREVIEW_VIEWER,
      createdAt: now,
      updatedAt: now,
    };
    nextId += 1;
    return event;
  });
  calendarEvents.push(...created);
  return created;
}

export async function updateEvents(
  _academyId: Id,
  input: { eventIds: Id[]; changes: EventChanges }
): Promise<{ updated: number }> {
  await fixtureDelay();
  let updated = 0;
  for (const id of input.eventIds) {
    const event = findEvent(id);
    if (event) {
      Object.assign(event, input.changes, {
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    }
  }
  return { updated };
}

export async function cancelEventDay(
  _academyId: Id,
  input: { eventId: Id; date: DateOnly; reason: string }
): Promise<{ eventId: Id; date: DateOnly }> {
  await fixtureDelay();
  const event = findEvent(input.eventId);
  if (event && !event.excludedDates.includes(input.date)) {
    event.excludedDates = [...event.excludedDates, input.date].sort();
  }
  return { eventId: input.eventId, date: input.date };
}

export async function deleteUpcoming(
  _academyId: Id,
  input: {
    sessions: Pick<
      EventSessionItem,
      "eventId" | "date" | "cancelled" | "tally"
    >[];
    today: DateOnly;
  }
): Promise<{ deleted: number; cancelled: number; kept: number }> {
  await fixtureDelay();
  let deleted = 0;
  let cancelled = 0;
  const ids = new Set(input.sessions.map((s) => s.eventId));
  for (const id of ids) {
    const days = input.sessions.filter((s) => s.eventId === id);
    if (days.every((d) => d.date >= input.today)) {
      for (const list of [detailEvents, calendarEvents]) {
        const index = list.findIndex((e) => e.id === id);
        if (index >= 0) {
          list.splice(index, 1);
        }
      }
      deleted += 1;
      continue;
    }
    const event = findEvent(id);
    for (const d of days) {
      if (event && !d.cancelled && d.date >= input.today) {
        event.excludedDates = [...event.excludedDates, d.date].sort();
        cancelled += 1;
      }
    }
  }
  return { deleted, cancelled, kept: 0 };
}

export async function listEventLocations(academyId: Id): Promise<string[]> {
  await fixtureDelay();
  const seen = new Set<string>();
  for (const e of allEvents()) {
    if (e.academyId === academyId && e.location) {
      seen.add(e.location);
    }
  }
  return [...seen].sort();
}
