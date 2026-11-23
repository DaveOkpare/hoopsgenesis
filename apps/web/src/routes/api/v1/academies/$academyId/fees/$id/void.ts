import { createFileRoute } from "@tanstack/react-router";

import { voidFee } from "@/server/api/v1/fees";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/fees/$id/void"
)({
  server: {
    handlers: {
      POST: voidFee,
    },
  },
});
