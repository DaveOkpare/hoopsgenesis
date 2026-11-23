import { queryOptions } from "@tanstack/react-query";

import { getNextSession, type SessionState } from "@/features/student-home/api";
import type { Id } from "@/features/types";

export type { NextSession, SessionState } from "@/features/student-home/api";

export const SESSION_STATES: readonly SessionState[] = [
  "upcoming",
  "checked-in",
  "checked-out",
];

export function isSessionState(value: unknown): value is SessionState {
  return SESSION_STATES.includes(value as SessionState);
}

export function nextSessionQueryOptions(
  academyId: Id,
  preview: SessionState | undefined
) {
  return queryOptions({
    queryKey: ["academies", academyId, "me", "next-session", preview] as const,
    queryFn: () => getNextSession(academyId, { preview }),
  });
}
