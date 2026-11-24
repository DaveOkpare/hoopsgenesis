import { createFileRoute } from "@tanstack/react-router";

import { useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import { MyTeamsScreen } from "@/features/teams/my-teams-screen";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/coach/teams/")({
  component: MyTeamsPage,
});

/** My teams, story CO-10 (Paper 8RA-0 web, C6C-0 phone). */
function MyTeamsPage() {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const now = useSessionClock();
  if (!membership) {
    return null;
  }
  const { academy } = membership;
  return (
    <MyTeamsScreen
      academyId={academy.id}
      academyName={academy.name}
      timeZone={academy.timezone}
      today={localDate(now, academy.timezone)}
      viewerId={viewer.user.id}
    />
  );
}
