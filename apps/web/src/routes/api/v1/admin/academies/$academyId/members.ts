import { createFileRoute } from "@tanstack/react-router";

import { adminListMembers } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/members"
)({
  server: {
    handlers: {
      GET: adminListMembers,
    },
  },
});
