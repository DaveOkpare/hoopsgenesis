import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { studentShell } from "@/components/app-shell/nav-config";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

/** Replace with the student's unpaid fee count when Fees is built. */
const NAV_COUNTS = { unpaidFees: 1 };

export const Route = createFileRoute("/_auth/student")({
  beforeLoad: ({ context }) => {
    if (!hasActiveRole(context.viewer, "student")) {
      throw redirect({ to: homePathFor(context.viewer) });
    }
  },
  component: StudentLayout,
});

function StudentLayout() {
  return (
    <AppShell config={studentShell} counts={NAV_COUNTS}>
      <Outlet />
    </AppShell>
  );
}
