import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { adminShell } from "@/components/app-shell/nav-config";
import { outstandingFeesQueryOptions } from "@/features/fees/queries";
import { reviewRecordsQueryOptions } from "@/features/records/queries";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

/** Sidebar counts from the designs, shown until the fees/records queries load. */
const NAV_COUNTS = { unpaidFees: 14, pendingRecords: 5 };

/** Unpaid students this month and records waiting for review, for the sidebar. */
function useAdminNavCounts() {
  const viewer = useViewer();
  const academyId = useActiveMembership()?.academy.id ?? "";
  const unpaid = useQuery(outstandingFeesQueryOptions(academyId));
  const pending = useQuery(
    reviewRecordsQueryOptions(
      academyId,
      { kind: "admin", viewerId: viewer.user.id },
      "pending"
    )
  );
  return {
    unpaidFees: unpaid.data?.length ?? NAV_COUNTS.unpaidFees,
    pendingRecords: pending.data?.length ?? NAV_COUNTS.pendingRecords,
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
