import { createFileRoute } from "@tanstack/react-router";

import { verifyRecord } from "@/server/api/v1/records";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/records/$id/verify"
)({
  server: {
    handlers: {
      POST: verifyRecord,
    },
  },
});
