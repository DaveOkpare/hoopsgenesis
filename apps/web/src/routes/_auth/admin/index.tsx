import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { DashboardScreen } from "@/features/dashboard/dashboard-screen";
import {
  type SetupSnapshot,
  setupChecklistQueryOptions,
} from "@/features/setup/queries";
import { SetupScreen } from "@/features/setup/setup-screen";
import { useActiveMembership } from "@/features/viewer/queries";

interface AdminHomeSearch {
  /** Preview the home of a new academy (setup not finished): `?setup=first-week`. */
  setup?: SetupSnapshot;
}

export const Route = createFileRoute("/_auth/admin/")({
  validateSearch: (search: Record<string, unknown>): AdminHomeSearch =>
    search.setup === "first-week" ? { setup: "first-week" } : {},
  component: AdminHome,
});

/**
 * Admin home (story AO-7). Until every setup step is done the home shows the setup
 * checklist instead (story AO-1, 1FH-0 has "Dashboard" active); the dashboard replaces it
 * once setup is complete.
 */
function AdminHome() {
  const { setup: snapshot = "current" } = Route.useSearch();
  const membership = useActiveMembership();
  const academy = membership?.academy;
  const checklist = useQuery({
    ...setupChecklistQueryOptions(academy?.id ?? "", snapshot),
    enabled: Boolean(academy),
  });
  if (!academy) {
    return null;
  }
  if (checklist.data && !checklist.data.complete) {
    return <SetupScreen academy={academy} snapshot={snapshot} />;
  }
  return <DashboardScreen academyId={academy.id} timeZone={academy.timezone} />;
}
