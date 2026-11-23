import { createFileRoute } from "@tanstack/react-router";

import { regenerateAcademyQr } from "@/server/api/v1/academy-qr";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/academy-qr/regenerate"
)({
  server: {
    handlers: {
      POST: regenerateAcademyQr,
    },
  },
});
