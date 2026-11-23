import { createFileRoute } from "@tanstack/react-router";

import { listRecordQueue } from "@/server/api/v1/records";

export const Route = createFileRoute("/api/v1/academies/$academyId/records/")({
  server: {
    handlers: {
      GET: listRecordQueue,
    },
  },
});
