import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/owner/audit")({
  component: AuditlogPage,
});

function AuditlogPage() {
  return (
    <RouteStub
      eyebrow="All academies"
      title="Audit log"
      web="1N8-0 Activity log layout, across academies"
    />
  );
}
