/*
 * Create calendar events (CO-2). See the convention in features/viewer/api.ts; the
 * fixture version is ./api.mock.ts (dev preview only).
 * "Repeat weekly until" has no recurrence rule in the API: the app creates one event per
 * week in one go, which is what createEvents does.
 */
import { addDays, daysBetween } from "@/features/sessions/time";
import type { CalendarEvent, DateOnly, Id, TimeOfDay } from "@/features/types";
import { academyPath, apiAll, apiData } from "@/lib/api-client";
import { isUiPreview } from "@/lib/preview";

const mock =
  import.meta.env.DEV && isUiPreview ? () => import("./api.mock") : null;

/** The types this form offers; the server accepts these and a few more. */
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

interface ServerEvent extends Omit<CalendarEvent, "createdBy"> {
  createdById: Id;
}

/** How far back the Location picker looks for places used before. */
const LOCATION_LOOKBACK_DAYS = 91;

function toCalendarEvent({
  createdById,
  ...event
}: ServerEvent): CalendarEvent {
  return { ...event, createdBy: createdById };
}

/**
 * One event per date (a single event when `dates` has one entry).
 * POST /events for each date (coach: own teams, teamId required). A multi-day event
 * keeps its length on every copy. The creator is the session user.
 */
export async function createEvents(
  academyId: Id,
  input: { event: CreateEventInput; dates: DateOnly[] }
): Promise<CalendarEvent[]> {
  if (mock) {
    return (await mock()).createEvents(academyId, input);
  }
  const { event } = input;
  const length = event.endDate
    ? daysBetween(event.startDate, event.endDate)
    : 0;
  const created = await Promise.all(
    input.dates.map((startDate) =>
      apiData<ServerEvent>(academyPath(academyId, "/events"), {
        method: "POST",
        body: {
          title: event.title,
          eventType: event.eventType,
          teamId: event.teamId,
          startDate,
          endDate: length > 0 ? addDays(startDate, length) : null,
          startTime: event.startTime,
          endTime: event.endTime,
          location: event.location || null,
          description: event.description || null,
          collectAttendance: event.collectAttendance,
        },
      })
    )
  );
  return created.map(toCalendarEvent);
}

/**
 * Places used before, for the Location picker: distinct `location` of the events the
 * caller can see over the last three months (GET /events?from=&to=).
 */
export async function listEventLocations(
  academyId: Id,
  params: { today: DateOnly }
): Promise<string[]> {
  if (mock) {
    return (await mock()).listEventLocations(academyId);
  }
  const events = await apiAll<{ location: string | null }>(
    academyPath(academyId, "/events"),
    {
      query: {
        from: addDays(params.today, 1 - LOCATION_LOOKBACK_DAYS),
        to: params.today,
      },
    }
  );
  const seen = new Set<string>();
  for (const e of events) {
    if (e.location) {
      seen.add(e.location);
    }
  }
  return [...seen].sort();
}
