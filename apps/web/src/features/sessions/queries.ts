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
import { useRef } from "react";

import {
  type AttendanceEntryInput,
  cancelSession,
  changeAttendance,
  deleteSeries,
  getSession,
  listSessionsOn,
  recordAttendance,
  type SessionAcademy,
  unverifyAttendance,
  verifyAttendance,
} from "@/features/sessions/api";
import type { DateOnly, Id, Timestamp } from "@/features/types";
import { newIdempotencyKey } from "@/lib/api-client";

export type {
  Session,
  SessionAcademy,
  SessionAttendance,
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
  academy: SessionAcademy,
  eventId: Id,
  date: DateOnly | undefined,
  asOf: Timestamp
) {
  return queryOptions({
    queryKey: sessionKeys.detail(academy.id, eventId, date, asOf),
    queryFn: () => getSession(academy, eventId, { date, asOf }),
    // Keep showing the session while the next minute's key loads.
    placeholderData: (previous) => previous,
  });
}

export function sessionsOnQueryOptions(
  academy: SessionAcademy,
  date: DateOnly,
  teamIds: Id[],
  asOf: Timestamp
) {
  return queryOptions({
    queryKey: sessionKeys.day(academy.id, date, teamIds, asOf),
    queryFn: () => listSessionsOn(academy, { date, teamIds, asOf }),
    placeholderData: (previous) => previous,
  });
}

function useInvalidateSessions(academyId: Id) {
  const queryClient = useQueryClient();
  return () =>
    queryClient.invalidateQueries({
      predicate: (query) =>
        query.queryKey[0] === "academies" &&
        query.queryKey[1] === academyId &&
        (query.queryKey[2] === "sessions" ||
          query.queryKey[2] === "attendance" ||
          query.queryKey[2] === "team-detail"),
    });
}

interface RecordInput {
  asOf: Timestamp;
  entries: AttendanceEntryInput[];
  eventId: Id;
  sessionDate: DateOnly;
}

/** Same entries as the last attempt: a retry of the same action. */
function sameAction(a: RecordInput, b: RecordInput): boolean {
  return (
    a.eventId === b.eventId &&
    a.sessionDate === b.sessionDate &&
    JSON.stringify(a.entries) === JSON.stringify(b.entries)
  );
}

/**
 * POST /attendance needs an Idempotency-Key: one per user action, reused when that
 * same action is retried after a failure, so a retry never records twice.
 */
export function useRecordAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  const last = useRef<{ input: RecordInput; key: string } | null>(null);
  return useMutation({
    mutationFn: (input: RecordInput) => {
      const previous = last.current;
      const key =
        previous && sameAction(previous.input, input)
          ? previous.key
          : newIdempotencyKey();
      last.current = { input, key };
      return recordAttendance(academyId, { ...input, idempotencyKey: key });
    },
    onSuccess: () => {
      last.current = null;
      return invalidate();
    },
    // Even a failed call may have changed rows (e.g. recorded, then the tick failed).
    onError: invalidate,
  });
}

export function useVerifyAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  return useMutation({
    mutationFn: (input: { ids: Id[]; asOf: Timestamp }) =>
      verifyAttendance(academyId, input),
    onSettled: invalidate,
  });
}

export function useUnverifyAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  return useMutation({
    mutationFn: (input: { id: Id }) => unverifyAttendance(academyId, input),
    onSettled: invalidate,
  });
}

interface ChangeInput {
  asOf: Timestamp;
  entry: AttendanceEntryInput;
  eventId: Id;
  reason: string;
  rowId: Id;
  sessionDate: DateOnly;
}

/** Admin: replace a recorded row (void + record), one Idempotency-Key per change. */
export function useChangeAttendance(academyId: Id) {
  const invalidate = useInvalidateSessions(academyId);
  const last = useRef<{ input: ChangeInput; key: string } | null>(null);
  return useMutation({
    mutationFn: (input: ChangeInput) => {
      const previous = last.current;
      const key =
        previous && JSON.stringify(previous.input) === JSON.stringify(input)
          ? previous.key
          : newIdempotencyKey();
      last.current = { input, key };
      return changeAttendance(academyId, { ...input, idempotencyKey: key });
    },
    onSuccess: () => {
      last.current = null;
    },
    onSettled: invalidate,
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
    onSettled: () =>
      queryClient.invalidateQueries({
        predicate: (query) =>
          query.queryKey[0] === "academies" && query.queryKey[1] === academyId,
      }),
  });
}
