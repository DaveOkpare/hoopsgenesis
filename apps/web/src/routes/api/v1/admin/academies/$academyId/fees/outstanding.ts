import { createFileRoute } from "@tanstack/react-router";

import { adminListOutstandingFees } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/fees/outstanding"
)({
  server: {
    handlers: {
      GET: adminListOutstandingFees,
    },
  },
});
