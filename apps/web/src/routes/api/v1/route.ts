import { createFileRoute } from "@tanstack/react-router";

import { apiRouteGuard } from "@/server/api/route-guard";

// Layout for every /api/v1 route: wrong methods get a JSON 405 and unknown
// paths a JSON 404 instead of the app's HTML page (see route-guard.ts).
export const Route = createFileRoute("/api/v1")({
  server: {
    middleware: [apiRouteGuard],
  },
});
