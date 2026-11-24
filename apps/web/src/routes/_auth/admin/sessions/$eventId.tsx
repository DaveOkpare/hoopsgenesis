import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSessionClock } from "@/features/sessions/clock";
import {
  SessionScreen,
  type SessionSheet,
} from "@/features/sessions/components/session-screen";
import { validateSessionSearch } from "@/features/sessions/search";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/admin/sessions/$eventId")({
  validateSearch: validateSessionSearch,
  component: AdminSessionPage,
});

/** An admin's view of a session: GFQ-0 web, GN5-0 phone (same screen as coaches). */
function AdminSessionPage() {
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
        navigate({ to: "/admin/calendar" });
        return;
      }
      closeSheet();
    },
    [closeSheet, navigate]
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
      sessionRole="admin"
      sheet={search.sheet}
      studentId={search.student}
      viewerId={viewer.user.id}
    />
  );
}
