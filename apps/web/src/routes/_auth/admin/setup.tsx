import { createFileRoute } from "@tanstack/react-router";

import type { SetupSnapshot } from "@/features/setup/queries";
import { SetupScreen } from "@/features/setup/setup-screen";
import { useActiveMembership } from "@/features/viewer/queries";

interface SetupSearch {
  /**
   * Preview only. Defaults to the academy as drawn in 1FH-0 ("first-week", 2 of 5 done);
   * `?setup=current` shows today's fully set-up academy.
   */
  setup?: SetupSnapshot;
}

export const Route = createFileRoute("/_auth/admin/setup")({
  validateSearch: (search: Record<string, unknown>): SetupSearch =>
    search.setup === "current" ? { setup: "current" } : {},
  component: SetupPage,
});

/** Setup checklist, story AO-1 (Paper 1FH-0). */
function SetupPage() {
  const { setup: snapshot = "first-week" } = Route.useSearch();
  const academy = useActiveMembership()?.academy;
  if (!academy) {
    return null;
  }
  return <SetupScreen academy={academy} snapshot={snapshot} />;
}
