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
  listSessionOptions,
} from "@/features/results/api";
import type { AthleticData, DrillId } from "@/features/results/templates";
import type { DateOnly, Id } from "@/features/types";

export type {
  CoachStudent,
  PastResult,
  SessionOption,
} from "@/features/results/api";

const resultKeys = {
  all: (academyId: Id) => ["academies", academyId, "results"] as const,
};

export function coachStudentsQueryOptions(academyId: Id, teamIds: Id[]) {
  return queryOptions({
    queryKey: [...resultKeys.all(academyId), "students", teamIds] as const,
    queryFn: () => listCoachStudents(academyId, { teamIds }),
  });
}

export function recentResultsQueryOptions(
  academyId: Id,
  studentId: Id,
  drill: DrillId
) {
  return queryOptions({
    queryKey: [
      ...resultKeys.all(academyId),
      "recent",
      studentId,
      drill,
    ] as const,
    queryFn: () => listRecentResults(academyId, { studentId, drill }),
  });
}

export function sessionOptionsQueryOptions(
  academyId: Id,
  teamId: Id,
  date: DateOnly
) {
  return queryOptions({
    queryKey: [...resultKeys.all(academyId), "sessions", teamId, date] as const,
    queryFn: () => listSessionOptions(academyId, { teamId, date }),
  });
}

export function useCreateAthleticRecord(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      studentId: Id;
      recordedOn: DateOnly;
      data: AthleticData & { sport: "basketball"; eventId?: Id };
      recordedBy: Id;
    }) => createAthleticRecord(academyId, input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: resultKeys.all(academyId) }),
  });
}
