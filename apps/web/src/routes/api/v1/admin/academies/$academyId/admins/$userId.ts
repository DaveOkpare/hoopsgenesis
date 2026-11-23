import { createFileRoute } from "@tanstack/react-router";

import { removeAcademyAdmin } from "@/server/api/v1/admin-academies";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/admins/$userId"
)({
  server: {
    handlers: {
      DELETE: removeAcademyAdmin,
    },
  },
});
