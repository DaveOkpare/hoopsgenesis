import { createFileRoute } from "@tanstack/react-router";

import { adminListRecords } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/records/"
)({
  server: {
    handlers: {
      GET: adminListRecords,
    },
  },
});
