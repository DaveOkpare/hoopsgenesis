import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSessionClock } from "@/features/sessions/clock";
import {
  SessionScreen,
  type SessionSheet,
} from "@/features/sessions/components/session-screen";
import { validateSessionSearch } from "@/features/sessions/search";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/coach/sessions/$eventId")({
  validateSearch: validateSessionSearch,
  component: SessionPage,
});

/** A coach's session: 3O4-0, 5IC-0, HZE-0 on phones; 91C-0, HRK-0 on the web. */
function SessionPage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const membership = useActiveMembership();
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
  const setQuery = useCallback(
    (q: string) =>
      navigate({
        search: (prev) => ({ ...prev, q: q || undefined }),
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

  if (!membership) {
    return null;
  }
  return (
    <SessionScreen
      academy={membership.academy}
      date={search.date}
      eventId={eventId}
      key={`${eventId}:${search.date ?? ""}`}
      membership={membership}
      now={now}
      onCancelled={handleCancelled}
      onCloseSheet={closeSheet}
      onOpenSheet={openSheet}
      onQuery={setQuery}
      query={search.q ?? ""}
      sessionRole="coach"
      sheet={search.sheet}
      studentId={search.student}
      viewerId={viewer.user.id}
    />
  );
}
