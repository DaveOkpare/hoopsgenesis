import { createFileRoute } from "@tanstack/react-router";

import { deleteRecord, getRecord, updateRecord } from "@/server/api/v1/records";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/records/$id/"
)({
  server: {
    handlers: {
      GET: getRecord,
      PATCH: updateRecord,
      DELETE: deleteRecord,
    },
  },
});
