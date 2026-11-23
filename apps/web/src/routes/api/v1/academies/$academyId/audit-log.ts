import { createFileRoute } from "@tanstack/react-router";

import { listAcademyAuditLog } from "@/server/api/v1/audit-log";

export const Route = createFileRoute("/api/v1/academies/$academyId/audit-log")({
  server: {
    handlers: {
      GET: listAcademyAuditLog,
    },
  },
});
