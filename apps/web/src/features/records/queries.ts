/*
 * Query layer for the records review queue. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { auditLogKeys } from "@/features/audit-log/queries";
import {
  listReviewRecords,
  type ReviewScope,
  recordsNow,
  rejectRecord,
  verifyRecord,
} from "@/features/records/api";
import type { Id, RecordStatus } from "@/features/types";

export type { ReviewItem, ReviewScope } from "@/features/records/api";

export const reviewKeys = {
  all: (academyId: Id) => ["academies", academyId, "records"] as const,
  list: (academyId: Id, scope: ReviewScope, status: RecordStatus | null) =>
    [...reviewKeys.all(academyId), "review", scope, { status }] as const,
};

export function reviewRecordsQueryOptions(
  academyId: Id,
  scope: ReviewScope,
  status: RecordStatus | null = null
) {
  return queryOptions({
    queryKey: reviewKeys.list(academyId, scope, status),
    queryFn: () => listReviewRecords(academyId, { scope, status }),
  });
}

function useInvalidateAfterReview(academyId: Id) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: reviewKeys.all(academyId) }),
      queryClient.invalidateQueries({ queryKey: auditLogKeys.all(academyId) }),
    ]);
  };
}

export function useVerifyRecord(academyId: Id, actorId: Id) {
  const invalidate = useInvalidateAfterReview(academyId);
  return useMutation({
    mutationFn: (recordId: Id) => verifyRecord(academyId, recordId, actorId),
    onSuccess: invalidate,
  });
}

export function useRejectRecord(academyId: Id, actorId: Id) {
  const invalidate = useInvalidateAfterReview(academyId);
  return useMutation({
    mutationFn: ({ recordId, reason }: { recordId: Id; reason: string }) =>
      rejectRecord(academyId, recordId, { reason }, actorId),
    onSuccess: invalidate,
  });
}

/** The current time for "3 days" / "Today"; fixture time in mock mode. */
export function currentTime(): Date {
  return recordsNow();
}
