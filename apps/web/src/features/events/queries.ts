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

export type { CreateEventInput, EventType } from "@/features/events/api";

export function eventLocationsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: ["academies", academyId, "events", "locations"] as const,
    queryFn: () => listEventLocations(academyId),
  });
}

export function useCreateEvents(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      event: CreateEventInput;
      dates: DateOnly[];
      createdBy: Id;
    }) => createEvents(academyId, input),
    // New sessions show up on Today and the session screens.
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" &&
          query.queryKey[1] === academyId &&
          (query.queryKey[2] === "sessions" || query.queryKey[2] === "events"),
      }),
  });
}
