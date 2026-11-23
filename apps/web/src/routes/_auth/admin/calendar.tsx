import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/admin/calendar")({
  component: CalendarPage,
});

function CalendarPage() {
  return <RouteStub eyebrow="November 2026" title="Calendar" />;
}
