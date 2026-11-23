/* Query layer for coach Today. Components import from here. */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { listRecordsToReview, verifyRecord } from "@/features/coach-today/api";
import type { Id } from "@/features/types";

export type { RecordToReview } from "@/features/coach-today/api";

export const coachTodayKeys = {
  records: (academyId: Id) =>
    ["academies", academyId, "records", "to-review"] as const,
};

export function recordsToReviewQueryOptions(
  academyId: Id,
  teams: { id: Id; name: string }[]
) {
  return queryOptions({
    queryKey: [
      ...coachTodayKeys.records(academyId),
      teams.map((t) => t.id),
    ] as const,
    queryFn: () => listRecordsToReview(academyId, { teams }),
  });
}

export function useVerifyRecord(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recordId: Id }) => verifyRecord(academyId, input),
    // Every records list for the academy: this panel, the queue and the sidebar count.
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: ["academies", academyId, "records"],
      }),
  });
}
