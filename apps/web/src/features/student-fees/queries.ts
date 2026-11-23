import { queryOptions } from "@tanstack/react-query";

import { listMyFees } from "@/features/student-fees/api";
import type { Id } from "@/features/types";

export type { FeeDue, MyFee, MyFees } from "@/features/student-fees/api";

export const myFeeKeys = {
  all: (academyId: Id) => ["academies", academyId, "me", "fees"] as const,
};

export function myFeesQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: myFeeKeys.all(academyId),
    queryFn: () => listMyFees(academyId),
  });
}
