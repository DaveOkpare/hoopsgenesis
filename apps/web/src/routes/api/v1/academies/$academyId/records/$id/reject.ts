import { createFileRoute } from "@tanstack/react-router";

import { rejectRecord } from "@/server/api/v1/records";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/records/$id/reject"
)({
  server: {
    handlers: {
      POST: rejectRecord,
    },
  },
});
