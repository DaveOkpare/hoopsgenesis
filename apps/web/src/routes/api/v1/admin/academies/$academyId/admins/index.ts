import { createFileRoute } from "@tanstack/react-router";

import { appointAcademyAdmin } from "@/server/api/v1/admin-academies";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/admins/"
)({
  server: {
    handlers: {
      POST: appointAcademyAdmin,
    },
  },
});
