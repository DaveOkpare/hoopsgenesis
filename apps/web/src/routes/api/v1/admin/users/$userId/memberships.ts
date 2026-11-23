import { createFileRoute } from "@tanstack/react-router";

import { adminListUserMemberships } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute("/api/v1/admin/users/$userId/memberships")(
  {
    server: {
      handlers: {
        GET: adminListUserMemberships,
      },
    },
  }
);
