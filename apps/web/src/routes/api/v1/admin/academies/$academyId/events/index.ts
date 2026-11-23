import { createFileRoute } from "@tanstack/react-router";

import { adminListEvents } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/events/"
)({
  server: {
    handlers: {
      GET: adminListEvents,
    },
  },
});
