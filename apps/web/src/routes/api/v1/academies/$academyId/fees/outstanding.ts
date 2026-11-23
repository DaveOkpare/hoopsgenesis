import { createFileRoute } from "@tanstack/react-router";

import { listOutstandingFees } from "@/server/api/v1/fees";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/fees/outstanding"
)({
  server: {
    handlers: {
      GET: listOutstandingFees,
    },
  },
});
