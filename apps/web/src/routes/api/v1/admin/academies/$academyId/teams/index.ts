import { createFileRoute } from "@tanstack/react-router";

import { adminListTeams } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/teams/"
)({
  server: {
    handlers: {
      GET: adminListTeams,
    },
  },
});
