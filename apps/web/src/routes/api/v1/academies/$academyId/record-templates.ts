import { createFileRoute } from "@tanstack/react-router";

import { listRecordTemplates } from "@/server/api/v1/record-templates";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/record-templates"
)({
  server: {
    handlers: {
      GET: listRecordTemplates,
    },
  },
});
