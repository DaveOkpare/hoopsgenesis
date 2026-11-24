import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { adminShell } from "@/components/app-shell/nav-config";
import { outstandingCountQueryOptions } from "@/features/fees/queries";
import { useActiveMembership } from "@/features/viewer/queries";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

/**
 * Unpaid students today, for the sidebar. Records carry no badge for admins: they are
 * read only there (coaches review them, IGD-0).
 */
function useAdminNavCounts() {
  const academyId = useActiveMembership()?.academy.id ?? "";
  // A failed count must never take down the shell: it just shows no badge.
  const unpaid = useQuery({
    ...outstandingCountQueryOptions(academyId),
    enabled: Boolean(academyId),
    throwOnError: false,
  });
  // No badge until the real numbers are in.
  return {
    ...(unpaid.data === undefined ? {} : { unpaidFees: unpaid.data }),
  };
}

export const Route = createFileRoute("/_auth/admin")({
  beforeLoad: ({ context }) => {
    if (!hasActiveRole(context.viewer, "admin")) {
      throw redirect({ to: homePathFor(context.viewer) });
    }
  },
  component: AdminLayout,
});

function AdminLayout() {
  const counts = useAdminNavCounts();
  return (
    <AppShell config={adminShell} counts={counts}>
      <Outlet />
    </AppShell>
  );
}
