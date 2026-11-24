import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import {
  type CoachTeamTab,
  TeamPage,
} from "@/features/team-detail/components/team-page";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

interface TeamSearch {
  /** "Add a student" search; below 1024px this opens the add sheet. */
  add?: string;
  /** Phone tab (HAB-0): Roster (default), Sessions or Results. */
  tab?: Exclude<CoachTeamTab, "roster">;
}

export const Route = createFileRoute("/_auth/coach/teams/$teamId")({
  validateSearch: (search: Record<string, unknown>): TeamSearch => ({
    add: typeof search.add === "string" ? search.add : undefined,
    tab:
      search.tab === "sessions" || search.tab === "results"
        ? search.tab
        : undefined,
  }),
  component: TeamDetailPage,
});

/** Team page for coaches (CO-7, CO-10): 4YX-0 web, HAB-0 phone. */
function TeamDetailPage() {
  const { teamId } = Route.useParams();
  const { add, tab } = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const academy = useActiveMembership()?.academy;
  const now = useSessionClock();
  const handleAddQuery = useCallback(
    (query: string | undefined) =>
      navigate({
        search: (prev) => ({ ...prev, add: query }),
        replace: true,
      }),
    [navigate]
  );
  const handleTab = useCallback(
    (next: CoachTeamTab) =>
      navigate({
        search: (prev) => ({
          ...prev,
          tab: next === "roster" ? undefined : next,
        }),
        replace: true,
      }),
    [navigate]
  );
  if (!academy) {
    return null;
  }
  return (
    <TeamPage
      academyId={academy.id}
      addQuery={add}
      onAddQueryChange={handleAddQuery}
      onTabChange={handleTab}
      tab={tab ?? "roster"}
      teamId={teamId}
      today={localDate(now, academy.timezone)}
      viewAs="coach"
      viewerId={viewer.user.id}
    />
  );
}
