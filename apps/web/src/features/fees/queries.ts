/*
 * Query layer for fees. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import { auditLogKeys } from "@/features/audit-log/queries";
import {
  feesNow,
  getDefaultFee,
  getFeeSummary,
  listFeeStudents,
  listFees,
  listFeeTeams,
  listOutstandingFees,
  type RecordPaymentInput,
  recordPayment,
  voidFee,
} from "@/features/fees/api";
import type { PeriodKey } from "@/features/fees/periods";
import type { Id } from "@/features/types";

export type {
  FeeStudent,
  FeeSummary,
  OutstandingRow,
  PaymentRow,
  RecordPaymentInput,
} from "@/features/fees/api";
// biome-ignore lint/performance/noBarrelFile: error classes are part of this feature's query API.
export { DuplicatePaymentError } from "@/features/fees/api";

export const feeKeys = {
  all: (academyId: Id) => ["academies", academyId, "fees"] as const,
  list: (academyId: Id, period: PeriodKey | null) =>
    [...feeKeys.all(academyId), "list", { period }] as const,
  outstanding: (academyId: Id, teamId: Id | null) =>
    [...feeKeys.all(academyId), "outstanding", { teamId }] as const,
  summary: (academyId: Id) => [...feeKeys.all(academyId), "summary"] as const,
  students: (academyId: Id) => [...feeKeys.all(academyId), "students"] as const,
  teams: (academyId: Id) => [...feeKeys.all(academyId), "teams"] as const,
  defaultFee: (academyId: Id) =>
    [...feeKeys.all(academyId), "default-fee"] as const,
};

export function feesQueryOptions(academyId: Id, period: PeriodKey | null) {
  return queryOptions({
    queryKey: feeKeys.list(academyId, period),
    queryFn: () => listFees(academyId, { period }),
  });
}

export function outstandingFeesQueryOptions(
  academyId: Id,
  teamId: Id | null = null
) {
  return queryOptions({
    queryKey: feeKeys.outstanding(academyId, teamId),
    queryFn: () => listOutstandingFees(academyId, { teamId }),
  });
}

export function feeSummaryQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: feeKeys.summary(academyId),
    queryFn: () => getFeeSummary(academyId),
  });
}

export function feeStudentsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: feeKeys.students(academyId),
    queryFn: () => listFeeStudents(academyId),
  });
}

export function feeTeamsQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: feeKeys.teams(academyId),
    queryFn: () => listFeeTeams(academyId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

export function defaultFeeQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: feeKeys.defaultFee(academyId),
    queryFn: () => getDefaultFee(academyId),
    staleTime: Number.POSITIVE_INFINITY,
  });
}

/** Record a cash or transfer payment; every fee list and total refreshes. */
export function useRecordPayment(academyId: Id, actorId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: RecordPaymentInput) =>
      recordPayment(academyId, input, actorId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all(academyId) });
    },
  });
}

/** Void a payment with a reason; it stays listed as voided and the activity log gains a row. */
export function useVoidFee(academyId: Id, actorId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feeId, reason }: { feeId: Id; reason: string }) =>
      voidFee(academyId, feeId, { reason }, actorId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: feeKeys.all(academyId) }),
        queryClient.invalidateQueries({
          queryKey: auditLogKeys.all(academyId),
        }),
      ]);
    },
  });
}

/** The current time for "days overdue" and "Today"; fixture time in mock mode. */
export function currentTime(): Date {
  return feesNow();
}
