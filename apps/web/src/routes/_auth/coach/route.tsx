import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { coachShell } from "@/components/app-shell/nav-config";
import { recordsToReviewQueryOptions } from "@/features/coach-today/queries";
import { useActiveMembership } from "@/features/viewer/queries";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

/**
 * Records waiting for this coach's review, for the sidebar. Same query as the Today
 * panel; no count is shown until it loads.
 */
function useCoachNavCounts() {
  const membership = useActiveMembership();
  const pending = useQuery({
    ...recordsToReviewQueryOptions(
      membership?.academy.id ?? "",
      membership?.teams ?? []
    ),
    enabled: Boolean(membership),
    // A failed count must never take down the shell: it just shows no badge.
    throwOnError: false,
  });
  return pending.data ? { pendingRecords: pending.data.length } : {};
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
