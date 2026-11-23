import { createFileRoute } from "@tanstack/react-router";

import { createAcademy, listAcademies } from "@/server/api/v1/admin-academies";

export const Route = createFileRoute("/api/v1/admin/academies/")({
  server: {
    handlers: {
      GET: listAcademies,
      POST: createAcademy,
    },
  },
});
