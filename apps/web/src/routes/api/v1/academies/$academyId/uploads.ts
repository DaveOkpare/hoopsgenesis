import { createFileRoute } from "@tanstack/react-router";

import { createUpload } from "@/server/api/v1/uploads";

export const Route = createFileRoute("/api/v1/academies/$academyId/uploads")({
  server: {
    handlers: {
      POST: createUpload,
    },
  },
});
