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
  countPendingRecords,
  getRecordFile,
  listReviewRecords,
  type ReviewScope,
  rejectRecord,
  verifyRecord,
} from "@/features/records/api";
import type { Id, RecordStatus } from "@/features/types";
import { appNow } from "@/lib/preview";

export type {
  RecordFile,
  ReviewItem,
  ReviewScope,
} from "@/features/records/api";

export const reviewKeys = {
  all: (academyId: Id) => ["academies", academyId, "records"] as const,
  list: (academyId: Id, scope: ReviewScope, status: RecordStatus | null) =>
    [...reviewKeys.all(academyId), "review", scope, { status }] as const,
};

/** Records waiting for the caller's review (sidebar badge). */
export function pendingRecordCountQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: [...reviewKeys.all(academyId), "pending-count"] as const,
    queryFn: () => countPendingRecords(academyId),
  });
}

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

export function useVerifyRecord(academyId: Id) {
  const invalidate = useInvalidateAfterReview(academyId);
  return useMutation({
    mutationFn: (recordId: Id) => verifyRecord(academyId, recordId),
    // Also after an error: a 409 means someone else reviewed it first.
    onSettled: invalidate,
  });
}

export function useRejectRecord(academyId: Id) {
  const invalidate = useInvalidateAfterReview(academyId);
  return useMutation({
    mutationFn: ({ recordId, reason }: { recordId: Id; reason: string }) =>
      rejectRecord(academyId, recordId, { reason }),
    onSettled: invalidate,
  });
}

/** Fetch a fresh signed link to a record's file (they expire quickly, so never cached). */
export function useOpenRecordFile(academyId: Id) {
  return useMutation({
    mutationFn: (recordId: Id) => getRecordFile(academyId, recordId),
  });
}

/** The current time for "3 days" / "Today"; fixture time in preview. */
export function currentTime(): Date {
  return appNow();
}
