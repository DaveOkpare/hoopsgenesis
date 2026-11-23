import { createFileRoute } from "@tanstack/react-router";

import { listTeams } from "@/server/api/v1/teams";

export const Route = createFileRoute("/api/v1/academies/$academyId/teams/")({
  server: {
    handlers: {
      GET: listTeams,
    },
  },
});
