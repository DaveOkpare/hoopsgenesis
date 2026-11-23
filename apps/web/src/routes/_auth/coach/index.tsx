import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { TodayScreen } from "@/features/coach-today/components/today-screen";
import { parseAtParam, useSessionClock } from "@/features/sessions/clock";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

interface TodaySearch {
  /** Preview clock, "HH:mm" (dev preview only). */
  at?: string;
  /** Team shown in the "this month" table. */
  team?: string;
}

export const Route = createFileRoute("/_auth/coach/")({
  validateSearch: (search: Record<string, unknown>): TodaySearch => ({
    at: parseAtParam(search.at),
    team: typeof search.team === "string" ? search.team : undefined,
  }),
  component: CoachToday,
});

function CoachToday() {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const now = useSessionClock();
  const handleTeamChange = useCallback(
    (team: string) =>
      navigate({ search: (prev) => ({ ...prev, team }), replace: true }),
    [navigate]
  );
  if (!membership) {
    return null;
  }
  return (
    <TodayScreen
      at={search.at}
      membership={membership}
      now={now}
      onTeamChange={handleTeamChange}
      teamId={search.team}
      viewerId={viewer.user.id}
      viewerName={viewer.user.name}
    />
  );
}
