import { createFileRoute } from "@tanstack/react-router";

import { adminGetFee } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/fees/$id"
)({
  server: {
    handlers: {
      GET: adminGetFee,
    },
  },
});
