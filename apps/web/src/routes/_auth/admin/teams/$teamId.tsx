import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import { useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import { TeamPage } from "@/features/team-detail/components/team-page";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

interface TeamSearch {
  /** "Add a student" search; on phones this opens the add sheet. */
  add?: string;
}

export const Route = createFileRoute("/_auth/admin/teams/$teamId")({
  validateSearch: (search: Record<string, unknown>): TeamSearch => ({
    add: typeof search.add === "string" ? search.add : undefined,
  }),
  component: TeamDetailPage,
});

function TeamDetailPage() {
  const { teamId } = Route.useParams();
  const { add } = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const academy = useActiveMembership()?.academy;
  const now = useSessionClock();
  const handleAddQuery = useCallback(
    (query: string | undefined) =>
      navigate({ search: { add: query }, replace: true }),
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
      teamId={teamId}
      today={localDate(now, academy.timezone)}
      viewAs="admin"
      viewerId={viewer.user.id}
    />
  );
}
