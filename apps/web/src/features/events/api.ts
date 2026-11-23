/*
 * Create calendar events (CO-2). Fixture-backed; see features/viewer/api.ts.
 * "Repeat weekly until" has no recurrence rule in the API: the app creates one event per
 * week in one go, which is what createEvents does.
 */
import { fixtureDelay } from "@/features/fixtures";
import { calendarEvents } from "@/features/sessions/fixtures";
import type { CalendarEvent, DateOnly, Id, TimeOfDay } from "@/features/types";

export type EventType = "training" | "match" | "camp" | "other";

/** POST /events body. */
export interface CreateEventInput {
  collectAttendance: boolean;
  description?: string;
  endDate?: DateOnly;
  endTime: TimeOfDay;
  eventType: EventType;
  location: string;
  startDate: DateOnly;
  startTime: TimeOfDay;
  teamId: Id;
  title: string;
}

let nextId = 1;

/**
 * One event per date (a single event when `dates` has one entry).
 * Real: POST /events for each date (coach: own teams, teamId required).
 */
export async function createEvents(
  academyId: Id,
  input: { event: CreateEventInput; dates: DateOnly[]; createdBy: Id }
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
      createdBy: input.createdBy,
      createdAt: now,
      updatedAt: now,
    };
    nextId += 1;
    return event;
  });
  calendarEvents.push(...created);
  return created;
}

/**
 * Places used before, for the Location picker.
 * Real: distinct `location` from GET /events over the last few months.
 */
export async function listEventLocations(academyId: Id): Promise<string[]> {
  await fixtureDelay();
  const seen = new Set<string>();
  for (const e of calendarEvents) {
    if (e.academyId === academyId && e.location) {
      seen.add(e.location);
    }
  }
  return [...seen].sort();
}
