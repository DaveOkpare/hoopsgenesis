import { createFileRoute } from "@tanstack/react-router";

import { getDashboard } from "@/server/api/v1/dashboard";

export const Route = createFileRoute("/api/v1/academies/$academyId/dashboard")({
  server: {
    handlers: {
      GET: getDashboard,
    },
  },
});
