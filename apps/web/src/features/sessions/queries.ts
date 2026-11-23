/*
 * Query layer for sessions (CO-1, CO-3..CO-6). Components import from here only.
 * Every attendance or calendar mutation invalidates ["academies", id, "sessions"], which
 * also refreshes Today (it lists sessions under the same key).
 */
import {
  queryOptions,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type AttendanceEntryInput,
  cancelSession,
  deleteSeries,
  getSession,
  listSessionsOn,
  recordAttendance,
  unverifyAttendance,
  verifyAttendance,
} from "@/features/sessions/api";
import type { DateOnly, Id, Timestamp } from "@/features/types";

export type {
  Session,
  SessionEntry,
  SessionStatus,
  SessionStudent,
} from "@/features/sessions/api";

export const sessionKeys = {
  all: (academyId: Id) => ["academies", academyId, "sessions"] as const,
  detail: (
    academyId: Id,
    eventId: Id,
    date: DateOnly | undefined,
    asOf: Timestamp
  ) =>
    [
      ...sessionKeys.all(academyId),
      "detail",
      eventId,
      date ?? null,
      asOf,
    ] as const,
  day: (academyId: Id, date: DateOnly, teamIds: Id[], asOf: Timestamp) =>
    [...sessionKeys.all(academyId), "day", date, teamIds, asOf] as const,
};

/** Minute precision, so the clock doesn't make a new query key every render. */
export function asOfKey(now: Date): Timestamp {
  const MINUTE = 60_000;
  return new Date(Math.floor(now.getTime() / MINUTE) * MINUTE).toISOString();
}

export function sessionQueryOptions(
  academyId: Id,
  eventId: Id,
  date: DateOnly | undefined,
  asOf: Timestamp
) {
  return queryOptions({
    queryKey: sessionKeys.detail(academyId, eventId, date, asOf),
    queryFn: () => getSession(academyId, eventId, { date, asOf }),
  });
}

export function sessionsOnQueryOptions(
  academyId: Id,
  date: DateOnly,
  teamIds: Id[],
  asOf: Timestamp
) {
  return queryOptions({
    queryKey: sessionKeys.day(academyId, date, teamIds, asOf),
    queryFn: () => listSessionsOn(academyId, { date, teamIds, asOf }),
  });
}

function useInvalidateSessions(academyId: Id) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({ queryKey: sessionKeys.all(academyId) });
}

export function useRecordAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  return useMutation({
    mutationFn: (input: {
      eventId: Id;
      sessionDate: DateOnly;
      entries: AttendanceEntryInput[];
      recordedBy: Id;
      asOf: Timestamp;
    }) => recordAttendance(academyId, input),
    onSuccess: invalidate,
  });
}

export function useVerifyAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  return useMutation({
    mutationFn: (input: { ids: Id[]; verifiedBy: Id; asOf: Timestamp }) =>
      verifyAttendance(academyId, input),
    onSuccess: invalidate,
  });
}

export function useUnverifyAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  return useMutation({
    mutationFn: (input: { id: Id }) => unverifyAttendance(academyId, input),
    onSuccess: invalidate,
  });
}

export function useCancelSession(academyId: Id) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      eventId: Id;
      sessionDate: DateOnly;
      reason: string;
      scope: "day" | "series";
    }) => {
      if (input.scope === "series") {
        await deleteSeries(academyId, {
          eventId: input.eventId,
          fromDate: input.sessionDate,
        });
        return;
      }
      await cancelSession(academyId, input);
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" && query.queryKey[1] === academyId,
      }),
  });
}
