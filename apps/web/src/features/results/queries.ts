/* Query layer for "Log a result". Components import from here. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  createAthleticRecord,
  listCoachStudents,
  listRecentResults,
  listResultTemplates,
  listSessionOptions,
} from "@/features/results/api";
import type { ResultTemplate } from "@/features/results/templates";
import type { DateOnly, Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";

export type {
  CoachStudent,
  PastResult,
  SessionOption,
} from "@/features/results/api";

const resultKeys = {
  all: (academyId: Id) => ["academies", academyId, "results"] as const,
};

export function resultTemplatesQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: [...resultKeys.all(academyId), "templates"] as const,
    queryFn: () => listResultTemplates(academyId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function coachStudentsQueryOptions(
  academyId: Id,
  teams: { id: Id; name: string }[]
) {
  return queryOptions({
    queryKey: [
      ...resultKeys.all(academyId),
      "students",
      teams.map((t) => t.id),
    ] as const,
    queryFn: () => listCoachStudents(academyId, { teams }),
  });
}

export function recentResultsQueryOptions(
  academyId: Id,
  studentId: Id,
  template: ResultTemplate
) {
  return queryOptions({
    queryKey: [
      ...resultKeys.all(academyId),
      "recent",
      studentId,
      template.id,
    ] as const,
    queryFn: () => listRecentResults(academyId, { studentId, template }),
  });
}

export function sessionOptionsQueryOptions(
  academyId: Id,
  team: { id: Id; name: string },
  date: DateOnly
) {
  return queryOptions({
    queryKey: [
      ...resultKeys.all(academyId),
      "sessions",
      team.id,
      date,
    ] as const,
    queryFn: () =>
      listSessionOptions(academyId, {
        teamId: team.id,
        teamName: team.name,
        date,
      }),
  });
}

export function useCreateAthleticRecord(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studentId: Id;
      recordedOn: DateOnly;
      template: ResultTemplate;
      score: number;
      eventId?: Id;
    }) => createAthleticRecord(academyId, input),
    // Results, the review queues and the team tables all read records.
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" &&
          query.queryKey[1] === academyId &&
          (query.queryKey[2] === "results" ||
            query.queryKey[2] === "records" ||
            query.queryKey[2] === "team-detail"),
      }),
  });
}

const RESULT_ERROR_COPY: Record<string, string> = {
  recorded_on_in_future: "The date can't be in the future.",
  record_type_not_allowed: "You can log results only for students you coach.",
  validation_failed: "That result doesn't fit this template.",
};

/** A toast line for a failed save, by the server's error code. */
export function resultErrorMessage(error: unknown): string {
  const fallback = "Could not save the result. Try again.";
  if (isApiError(error)) {
    return RESULT_ERROR_COPY[error.code] ?? errorMessage(error, fallback);
  }
  return errorMessage(error, fallback);
}
