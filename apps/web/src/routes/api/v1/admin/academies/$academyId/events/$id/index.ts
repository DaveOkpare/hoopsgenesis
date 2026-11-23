import { createFileRoute } from "@tanstack/react-router";

import { adminGetEvent } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/events/$id/"
)({
  server: {
    handlers: {
      GET: adminGetEvent,
    },
  },
});
