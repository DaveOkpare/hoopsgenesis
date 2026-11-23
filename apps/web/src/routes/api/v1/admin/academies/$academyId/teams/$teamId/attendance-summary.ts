import { createFileRoute } from "@tanstack/react-router";

import { adminGetTeamAttendanceSummary } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/teams/$teamId/attendance-summary"
)({
  server: {
    handlers: {
      GET: adminGetTeamAttendanceSummary,
    },
  },
});
