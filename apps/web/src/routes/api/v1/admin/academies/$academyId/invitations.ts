import { createFileRoute } from "@tanstack/react-router";

import { adminListInvitations } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/invitations"
)({
  server: {
    handlers: {
      GET: adminListInvitations,
    },
  },
});
