import { createFileRoute } from "@tanstack/react-router";

import { deleteAcademy } from "@/server/api/v1/admin-academies";

export const Route = createFileRoute("/api/v1/admin/academies/$academyId/")({
  server: {
    handlers: {
      DELETE: deleteAcademy,
    },
  },
});
