import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { parseAtParam, useSessionClock } from "@/features/sessions/clock";
import {
  SessionScreen,
  type SessionSheet,
} from "@/features/sessions/components/session-screen";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface SessionSearch {
  /** Preview clock, "HH:mm" (dev preview only). */
  at?: string;
  /** Session day for multi-day events; defaults to the event's start date. */
  date?: string;
  /** Deep-linkable sheets: ?sheet=check-in&student=<id>, ?sheet=cancel. */
  sheet?: SessionSheet;
  student?: string;
}

export const Route = createFileRoute("/_auth/coach/sessions/$eventId")({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    at: parseAtParam(search.at),
    date:
      typeof search.date === "string" && PLAIN_DATE.test(search.date)
        ? search.date
        : undefined,
    sheet:
      search.sheet === "check-in" || search.sheet === "cancel"
        ? search.sheet
        : undefined,
    student: typeof search.student === "string" ? search.student : undefined,
  }),
  component: SessionPage,
});

function SessionPage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const academy = useActiveMembership()?.academy;
  const now = useSessionClock();

  const openSheet = useCallback(
    (sheet: SessionSheet, studentId?: string) =>
      navigate({
        search: (prev) => ({ ...prev, sheet, student: studentId }),
        replace: true,
      }),
    [navigate]
  );
  const closeSheet = useCallback(
    () =>
      navigate({
        search: (prev) => ({ ...prev, sheet: undefined, student: undefined }),
        replace: true,
      }),
    [navigate]
  );
  const handleCancelled = useCallback(
    (scope: "day" | "series") => {
      if (scope === "series") {
        navigate({ to: "/coach", search: { at: search.at } });
        return;
      }
      closeSheet();
    },
    [closeSheet, navigate, search.at]
  );

  if (!academy) {
    return null;
  }
  return (
    <SessionScreen
      academy={academy}
      date={search.date}
      eventId={eventId}
      now={now}
      onCancelled={handleCancelled}
      onCloseSheet={closeSheet}
      onOpenSheet={openSheet}
      sheet={search.sheet}
      studentId={search.student}
      viewerId={viewer.user.id}
    />
  );
}
