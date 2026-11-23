import { createFileRoute } from "@tanstack/react-router";

import { getFee } from "@/server/api/v1/fees";

export const Route = createFileRoute("/api/v1/academies/$academyId/fees/$id/")({
  server: {
    handlers: {
      GET: getFee,
    },
  },
});
