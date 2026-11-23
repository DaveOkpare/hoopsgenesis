import { createFileRoute } from "@tanstack/react-router";

import { cancelAdminInvitation } from "@/server/api/v1/admin-academies";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/admin-invitations/$id"
)({
  server: {
    handlers: {
      DELETE: cancelAdminInvitation,
    },
  },
});
