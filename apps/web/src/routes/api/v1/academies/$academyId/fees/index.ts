import { createFileRoute } from "@tanstack/react-router";

import { listFees, recordFee } from "@/server/api/v1/fees";

export const Route = createFileRoute("/api/v1/academies/$academyId/fees/")({
  server: {
    handlers: {
      GET: listFees,
      POST: recordFee,
    },
  },
});
