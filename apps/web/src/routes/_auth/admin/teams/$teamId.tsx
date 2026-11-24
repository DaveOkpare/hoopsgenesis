import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import {
  type AdminTeamSheet,
  TeamPage,
} from "@/features/team-detail/components/team-page";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

interface TeamSearch {
  /** "Add a student" search; below 1024px this opens the add sheet. */
  add?: string;
  /** 7S4-0 sheets: "Edit coaches" or "Remove a student…". */
  sheet?: AdminTeamSheet;
}

export const Route = createFileRoute("/_auth/admin/teams/$teamId")({
  validateSearch: (search: Record<string, unknown>): TeamSearch => ({
    add: typeof search.add === "string" ? search.add : undefined,
    sheet:
      search.sheet === "coaches" || search.sheet === "remove"
        ? search.sheet
        : undefined,
  }),
  component: TeamDetailPage,
});

/** Team page for admins (AO-3): 4YX-0 web, 7S4-0 phone. */
function TeamDetailPage() {
  const { teamId } = Route.useParams();
  const { add, sheet } = Route.useSearch();
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
  const handleSheet = useCallback(
    (next: AdminTeamSheet | undefined) =>
      navigate({
        search: (prev) => ({ ...prev, sheet: next }),
        replace: next === undefined,
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
      onSheetChange={handleSheet}
      sheet={sheet}
      teamId={teamId}
      today={localDate(now, academy.timezone)}
      viewAs="admin"
      viewerId={viewer.user.id}
    />
  );
}
