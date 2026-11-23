/* Preview-mode (fixture) implementation of features/events/api.ts. Dev only. */

import type { CreateEventInput } from "@/features/events/api";
import { fixtureDelay } from "@/features/fixtures";
import { calendarEvents } from "@/features/sessions/fixtures";
import type { CalendarEvent, DateOnly, Id } from "@/features/types";

/** The preview coach (Sharika). */
const PREVIEW_VIEWER = "user-sharika";

let nextId = 1;

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
