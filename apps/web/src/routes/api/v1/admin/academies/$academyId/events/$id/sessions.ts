import { createFileRoute } from "@tanstack/react-router";

import { adminListEventSessions } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/events/$id/sessions"
)({
  server: {
    handlers: {
      GET: adminListEventSessions,
    },
  },
});
