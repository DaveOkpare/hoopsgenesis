import { createFileRoute } from "@tanstack/react-router";

import { adminListFees } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/fees/"
)({
  server: {
    handlers: {
      GET: adminListFees,
    },
  },
});
