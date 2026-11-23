import { createFileRoute } from "@tanstack/react-router";

import { RouteStub } from "@/components/route-stub";

export const Route = createFileRoute("/_auth/admin/attendance")({
  component: AttendancePage,
});

function AttendancePage() {
  return <RouteStub eyebrow="This week" title="Attendance" />;
}
