import { queryOptions } from "@tanstack/react-query";

import { getMyFee, listMyFees } from "@/features/student-fees/api";
import type { Id } from "@/features/types";

export type {
  FeeDue,
  FeeStanding,
  MyFee,
  MyFeeStatus,
  MyFees,
} from "@/features/student-fees/api";

/** The path segment of the estimated (not billed) fee's page: /student/fees/due. */
export const ESTIMATED_DUE_ID = "due";

export const myFeeKeys = {
  all: (academyId: Id) => ["academies", academyId, "me", "fees"] as const,
  detail: (academyId: Id, feeId: Id) =>
    ["academies", academyId, "me", "fee", feeId] as const,
};

export function myFeesQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: myFeeKeys.all(academyId),
    queryFn: () => listMyFees(academyId),
  });
}

/** One of the student's fees. A 404 is final (not retried). */
export function myFeeQueryOptions(academyId: Id, feeId: Id) {
  return queryOptions({
    queryKey: myFeeKeys.detail(academyId, feeId),
    queryFn: () => getMyFee(academyId, feeId),
    retry: false,
  });
}
