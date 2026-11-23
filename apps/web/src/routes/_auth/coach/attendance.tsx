import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/coach/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  return <RouteStub eyebrow="Your teams" title="Attendance" />;
}
