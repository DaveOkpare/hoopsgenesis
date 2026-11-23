import { createFileRoute } from "@tanstack/react-router";

import { adminGetDashboard } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/dashboard"
)({
  server: {
    handlers: {
      GET: adminGetDashboard,
    },
  },
});
