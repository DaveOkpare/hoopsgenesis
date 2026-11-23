import { createFileRoute } from "@tanstack/react-router";

import { getTeamAttendanceSummary } from "@/server/api/v1/attendance-summary";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/teams/$teamId/attendance-summary"
)({
  server: {
    handlers: {
      GET: getTeamAttendanceSummary,
    },
  },
});
