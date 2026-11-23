import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { AppShell } from "@/components/app-shell/app-shell";
import { ownerShell } from "@/components/app-shell/nav-config";
import { platformAcademiesQueryOptions } from "@/features/owner-academies/queries";
import { homePathFor, isOwner } from "@/features/viewer/selectors";

export const Route = createFileRoute("/_auth/owner")({
  beforeLoad: ({ context }) => {
    if (!isOwner(context.viewer)) {
      throw redirect({ to: homePathFor(context.viewer) });
    }
  },
  component: OwnerLayout,
});

function OwnerLayout() {
  // The sidebar count is the number of academies in the console.
  // A failed count must never take down the shell: it just shows no badge.
  const { data: academies } = useQuery({
    ...platformAcademiesQueryOptions(),
    throwOnError: false,
  });
  const counts = academies ? { academies: academies.length } : {};
  return (
    <AppShell config={ownerShell} counts={counts}>
      <Outlet />
    </AppShell>
  );
}
