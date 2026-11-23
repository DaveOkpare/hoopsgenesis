import { createFileRoute } from "@tanstack/react-router";

import { listMyFees } from "@/server/api/v1/fees";

export const Route = createFileRoute("/api/v1/me/fees")({
  server: {
    handlers: {
      GET: listMyFees,
    },
  },
});
