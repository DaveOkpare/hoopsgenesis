import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { studentShell } from "@/components/app-shell/nav-config";
import { myFeesQueryOptions } from "@/features/student-fees/queries";
import { useActiveMembership } from "@/features/viewer/queries";
import { hasActiveRole, homePathFor } from "@/features/viewer/selectors";

export const Route = createFileRoute("/_auth/student")({
  beforeLoad: ({ context }) => {
    if (!hasActiveRole(context.viewer, "student")) {
      throw redirect({ to: homePathFor(context.viewer) });
    }
  },
  component: StudentLayout,
});

/** The Fees badge: 1 while a fee is due, nothing until the fees have loaded. */
function useStudentNavCounts() {
  const academyId = useActiveMembership()?.academy.id ?? "";
  const fees = useQuery({
    ...myFeesQueryOptions(academyId),
    enabled: Boolean(academyId),
    // A failed count must never take down the shell: it just shows no badge.
    throwOnError: false,
  });
  if (!fees.data) {
    return {};
  }
  return { unpaidFees: fees.data.due ? 1 : 0 };
}

function StudentLayout() {
  const counts = useStudentNavCounts();
  return (
    <AppShell config={studentShell} counts={counts}>
      <Outlet />
    </AppShell>
  );
}
