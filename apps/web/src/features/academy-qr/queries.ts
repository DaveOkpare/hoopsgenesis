/*
 * Query layer for the academy QR code. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type AcademyQrDetails,
  getAcademyQr,
  regenerateAcademyQr,
} from "@/features/academy-qr/api";
import { auditLogKeys } from "@/features/audit-log/queries";
import type { Id } from "@/features/types";

export type { AcademyQrDetails } from "@/features/academy-qr/api";

export const academyQrKeys = {
  detail: (academyId: Id) => ["academies", academyId, "academy-qr"] as const,
};

export function academyQrQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: academyQrKeys.detail(academyId),
    queryFn: () => getAcademyQr(academyId),
  });
}

/** Replace the code: the new one shows straight away and the activity log gains a row. */
export function useRegenerateAcademyQr(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => regenerateAcademyQr(academyId),
    onSuccess: async (data) => {
      queryClient.setQueryData<AcademyQrDetails>(
        academyQrKeys.detail(academyId),
        data
      );
      await queryClient.invalidateQueries({
        queryKey: auditLogKeys.all(academyId),
      });
    },
  });
}
