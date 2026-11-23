import { createFileRoute } from "@tanstack/react-router";

import { listTeamMembers } from "@/server/api/v1/teams";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/teams/$teamId/members"
)({
  server: {
    handlers: {
      GET: listTeamMembers,
    },
  },
});
