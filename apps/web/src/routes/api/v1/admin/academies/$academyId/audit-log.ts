import { createFileRoute } from "@tanstack/react-router";

import { adminListAcademyAuditLog } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/audit-log"
)({
  server: {
    handlers: {
      GET: adminListAcademyAuditLog,
    },
  },
});
