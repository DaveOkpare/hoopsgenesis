import { createFileRoute } from "@tanstack/react-router";

import { listAdminAuditLog } from "@/server/api/v1/audit-log";

export const Route = createFileRoute("/api/v1/admin/audit-log")({
  server: {
    handlers: {
      GET: listAdminAuditLog,
    },
  },
});
