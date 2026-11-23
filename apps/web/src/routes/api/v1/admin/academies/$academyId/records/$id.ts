import { createFileRoute } from "@tanstack/react-router";

import { adminGetRecord } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/records/$id"
)({
  server: {
    handlers: {
      GET: adminGetRecord,
    },
  },
});
