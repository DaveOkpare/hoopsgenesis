import { createFileRoute } from "@tanstack/react-router";

import { getAcademyQr } from "@/server/api/v1/academy-qr";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/academy-qr/"
)({
  server: {
    handlers: {
      GET: getAcademyQr,
    },
  },
});
