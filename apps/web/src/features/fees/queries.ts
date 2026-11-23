/*
 * Query layer for fees. Components import from here, never from api.ts.
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { useRef } from "react";

import { auditLogKeys } from "@/features/audit-log/queries";
import {
  AlreadyVoidedError,
  countOutstandingFees,
  DuplicatePaymentError,
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
import { forgetStudentDirectory } from "@/features/fees/student-directory";
import type { Id } from "@/features/types";
import { newIdempotencyKey } from "@/lib/api-client";
import { appNow } from "@/lib/preview";

export type {
  FeeStudent,
  FeeSummary,
  OutstandingRow,
  PaymentRow,
  RecordPaymentInput,
} from "@/features/fees/api";

/** 409: the student already has a payment for that period. */
export function isDuplicatePayment(error: unknown): boolean {
  return error instanceof DuplicatePaymentError;
}

/** 409: the payment was voided already (by someone else, or a second click). */
export function isAlreadyVoided(error: unknown): boolean {
  return error instanceof AlreadyVoidedError;
}

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
  outstandingCount: (academyId: Id) =>
    [...feeKeys.all(academyId), "outstanding-count"] as const,
};

/** How many students haven't paid for today (sidebar badge). */
export function outstandingCountQueryOptions(academyId: Id) {
  return queryOptions({
    queryKey: feeKeys.outstandingCount(academyId),
    queryFn: () => countOutstandingFees(academyId),
  });
}

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

/**
 * Record a cash or transfer payment; every fee list and total refreshes. One
 * Idempotency-Key per payment: a retry of the same values (after a network error)
 * reuses it, so the server never records the payment twice; new values get a new key.
 * A 409 for the period refreshes the lists so the dialog's duplicate notice shows.
 */
export function useRecordPayment(academyId: Id) {
  const queryClient = useQueryClient();
  const attempt = useRef<{ signature: string; key: string } | null>(null);
  return useMutation({
    mutationFn: (input: RecordPaymentInput) => {
      const signature = JSON.stringify(input);
      if (attempt.current?.signature !== signature) {
        attempt.current = { signature, key: newIdempotencyKey() };
      }
      return recordPayment(academyId, input, attempt.current.key);
    },
    onSuccess: () => {
      attempt.current = null;
    },
    onSettled: async () => {
      await queryClient.invalidateQueries({ queryKey: feeKeys.all(academyId) });
    },
  });
}

/** Void a payment with a reason; it stays listed as voided and the activity log gains a row. */
export function useVoidFee(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ feeId, reason }: { feeId: Id; reason: string }) =>
      voidFee(academyId, feeId, { reason }),
    onSettled: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: feeKeys.all(academyId) }),
        queryClient.invalidateQueries({
          queryKey: auditLogKeys.all(academyId),
        }),
      ]);
    },
  });
}

/** The current time for "days overdue" and "Today"; fixture time in preview. */
export function currentTime(): Date {
  return appNow();
}

/** Forget cached names and teams (after roster changes elsewhere). */
export function refreshFeeDirectory(academyId: Id): void {
  forgetStudentDirectory(academyId);
}
