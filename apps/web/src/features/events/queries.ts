/* Query layer for events: create, event detail, the student's event day, edit, cancel, delete. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type CreateEventInput,
  cancelEventDay,
  createEvents,
  deleteUpcoming,
  type EventChanges,
  type EventSessionItem,
  type EventViewer,
  getEventDay,
  getEventDetail,
  listEventLocations,
  updateEvents,
} from "@/features/events/api";
import type { DateOnly, Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";

export type {
  CreateEventInput,
  EventChanges,
  EventDay,
  EventDetail,
  EventKind,
  EventSessionItem,
  EventType,
  EventViewer,
  MyAttendanceRow,
  SessionTally,
} from "@/features/events/api";

export const eventKeys = {
  all: (academyId: Id) => ["academies", academyId, "events"] as const,
  detail: (academyId: Id, eventId: Id, viewer: string) =>
    [...eventKeys.all(academyId), "detail", eventId, viewer] as const,
  day: (academyId: Id, eventId: Id, date: DateOnly | null, today: DateOnly) =>
    [...eventKeys.all(academyId), "day", eventId, date, today] as const,
};

export function eventDetailQueryOptions(viewer: EventViewer, eventId: Id) {
  return queryOptions({
    queryKey: eventKeys.detail(
      viewer.academyId,
      eventId,
      `${viewer.today}:${viewer.isAdmin}:${viewer.isStaff}`
    ),
    queryFn: () => getEventDetail(viewer, eventId),
  });
}

export function eventDayQueryOptions(
  viewer: Pick<EventViewer, "academyId" | "today">,
  eventId: Id,
  date: DateOnly | undefined
) {
  return queryOptions({
    queryKey: eventKeys.day(
      viewer.academyId,
      eventId,
      date ?? null,
      viewer.today
    ),
    queryFn: () => getEventDay(viewer, eventId, date),
  });
}

export function eventLocationsQueryOptions(academyId: Id, today: DateOnly) {
  return queryOptions({
    queryKey: [...eventKeys.all(academyId), "locations", today] as const,
    queryFn: () => listEventLocations(academyId, { today }),
  });
}

/** Events, sessions, Today, calendars and attendance all read the calendar. */
function useInvalidateCalendar(academyId: Id) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "academies" && query.queryKey[1] === academyId,
    });
}

export function useCreateEvents(academyId: Id) {
  const invalidate = useInvalidateCalendar(academyId);
  return useMutation({
    mutationFn: (input: { event: CreateEventInput; dates: DateOnly[] }) =>
      createEvents(academyId, input),
    onSettled: invalidate,
  });
}

export function useUpdateEvents(academyId: Id) {
  const invalidate = useInvalidateCalendar(academyId);
  return useMutation({
    mutationFn: (input: { eventIds: Id[]; changes: EventChanges }) =>
      updateEvents(academyId, input),
    onSettled: invalidate,
  });
}

export function useCancelEventDay(academyId: Id) {
  const invalidate = useInvalidateCalendar(academyId);
  return useMutation({
    mutationFn: (input: { eventId: Id; date: DateOnly; reason: string }) =>
      cancelEventDay(academyId, input),
    onSettled: invalidate,
  });
}

export function useDeleteUpcoming(academyId: Id) {
  const invalidate = useInvalidateCalendar(academyId);
  return useMutation({
    mutationFn: (input: {
      sessions: Pick<
        EventSessionItem,
        "eventId" | "date" | "cancelled" | "tally"
      >[];
      today: DateOnly;
    }) => deleteUpcoming(academyId, input),
    // Not on success: the page navigates away and its query would only 404.
    onError: invalidate,
  });
}

const EVENT_ERROR_COPY: Record<string, string> = {
  not_on_team: "You can only use teams you coach.",
  team_required: "Choose one of your teams.",
  attendance_needs_times: "Taking attendance needs a start and end time.",
  invalid_times: "The end time must be after the start time.",
  invalid_date_range: "The end date must be on or after the start date.",
  event_too_long: "That event is too long.",
  attendance_exists:
    "Students have already checked in, so the dates, times and team can't change, and that day can't be cancelled.",
  already_cancelled: "That day is already cancelled.",
  session_not_found: "The event has no session that day.",
};

/** A toast line for a failed event action, by the server's error code (or its first issue). */
export function eventErrorMessage(
  error: unknown,
  fallback = "Could not save the event. Try again."
): string {
  if (!isApiError(error)) {
    return errorMessage(error, fallback);
  }
  const known = EVENT_ERROR_COPY[error.code];
  if (known) {
    return known;
  }
  const issues = (error.details as { issues?: { message?: string }[] } | null)
    ?.issues;
  return issues?.[0]?.message ?? errorMessage(error, fallback);
}
