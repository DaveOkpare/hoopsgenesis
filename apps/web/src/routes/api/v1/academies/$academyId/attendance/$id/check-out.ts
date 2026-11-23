import { createFileRoute } from "@tanstack/react-router";

import { checkOutAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/$id/check-out"
)({
  server: {
    handlers: {
      POST: checkOutAttendance,
    },
  },
});
