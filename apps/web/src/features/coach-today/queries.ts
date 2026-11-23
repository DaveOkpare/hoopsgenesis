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
  teamIds: Id[],
  viewerId: Id
) {
  return queryOptions({
    queryKey: [...coachTodayKeys.records(academyId), teamIds, viewerId],
    queryFn: () => listRecordsToReview(academyId, { teamIds, viewerId }),
  });
}

export function useVerifyRecord(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { recordId: Id; verifiedBy: Id }) =>
      verifyRecord(academyId, input),
    // Every records list for the academy: this panel, the queue and the sidebar count.
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["academies", academyId, "records"],
      }),
  });
}
