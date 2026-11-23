import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/coach/teams/")({
  component: MyteamsPage,
});

function MyteamsPage() {
  return (
    <RouteStub
      eyebrow="U12, U14, U16"
      title="My teams"
      web="4YX-0 Team page (pick a team)"
    />
  );
}
