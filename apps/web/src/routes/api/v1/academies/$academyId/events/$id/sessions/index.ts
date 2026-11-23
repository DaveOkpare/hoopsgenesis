import { createFileRoute } from "@tanstack/react-router";

import { listEventSessions } from "@/server/api/v1/events-sessions";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/events/$id/sessions/"
)({
  server: {
    handlers: {
      GET: listEventSessions,
    },
  },
});
