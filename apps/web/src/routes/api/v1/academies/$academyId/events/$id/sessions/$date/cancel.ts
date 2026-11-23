import { createFileRoute } from "@tanstack/react-router";

import { cancelEventSession } from "@/server/api/v1/events-sessions";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/events/$id/sessions/$date/cancel"
)({
  server: {
    handlers: {
      POST: cancelEventSession,
    },
  },
});
