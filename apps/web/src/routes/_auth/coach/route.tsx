import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { coachShell } from "@/components/app-shell/nav-config";
import { reviewRecordsQueryOptions } from "@/features/records/queries";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

/** Sidebar count from the designs, shown until the records query loads. */
const NAV_COUNTS = { pendingRecords: 3 };

/** Records waiting for this coach's review, for the sidebar. */
function useCoachNavCounts() {
  const viewer = useViewer();
  const membership = useActiveMembership();
  const pending = useQuery(
    reviewRecordsQueryOptions(
      membership?.academy.id ?? "",
      {
        kind: "coach",
        viewerId: viewer.user.id,
        teamIds: membership?.teams.map((team) => team.id) ?? [],
      },
      "pending"
    )
  );
  return {
    pendingRecords: pending.data?.length ?? NAV_COUNTS.pendingRecords,
  };
}

export const Route = createFileRoute("/_auth/coach")({
  beforeLoad: ({ context }) => {
    if (!hasActiveRole(context.viewer, "coach")) {
      throw redirect({ to: homePathFor(context.viewer) });
    }
  },
  component: CoachLayout,
});

function CoachLayout() {
  const counts = useCoachNavCounts();
  return (
    <AppShell config={coachShell} counts={counts}>
      <Outlet />
    </AppShell>
  );
}
