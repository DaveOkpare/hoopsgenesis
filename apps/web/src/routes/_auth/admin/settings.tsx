import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/admin/settings")({
  component: AcademysettingsPage,
});

function AcademysettingsPage() {
  return <RouteStub eyebrow="Hoops Genesis Kigali" title="Academy settings" />;
}
