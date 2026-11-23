import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";
import { useActiveMembership } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/coach/teams/")({
  component: MyteamsPage,
});

/** No design yet: names the coach's teams (from the session) above the stub. */
function MyteamsPage() {
  const teams = useActiveMembership()?.teams ?? [];
  return (
    <RouteStub
      eyebrow={teams.map((team) => team.name).join(", ") || "No team yet"}
      title="My teams"
      web="4YX-0 Team page (pick a team)"
    />
  );
}
