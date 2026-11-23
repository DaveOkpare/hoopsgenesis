/* Query layer for creating events. Components import from here. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type CreateEventInput,
  createEvents,
  listEventLocations,
} from "@/features/events/api";
import type { DateOnly, Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";

export type { CreateEventInput, EventType } from "@/features/events/api";

export function eventLocationsQueryOptions(academyId: Id, today: DateOnly) {
  return queryOptions({
    queryKey: ["academies", academyId, "events", "locations", today] as const,
    queryFn: () => listEventLocations(academyId, { today }),
  });
}

export function useCreateEvents(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { event: CreateEventInput; dates: DateOnly[] }) =>
      createEvents(academyId, input),
    // New sessions show up on Today and the session screens.
    onSettled: () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" &&
          query.queryKey[1] === academyId &&
          (query.queryKey[2] === "sessions" || query.queryKey[2] === "events"),
      }),
  });
}

const EVENT_ERROR_COPY: Record<string, string> = {
  not_on_team: "You can only add events to teams you coach.",
  team_required: "Choose one of your teams.",
  attendance_needs_times: "Taking attendance needs a start and end time.",
  invalid_times: "The end time must be after the start time.",
  invalid_date_range: "The end date must be on or after the start date.",
  event_too_long: "That event is too long.",
};

/** A toast line for a failed create, by the server's error code (or its first issue). */
export function eventErrorMessage(error: unknown): string {
  const fallback = "Could not create the event. Try again.";
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
