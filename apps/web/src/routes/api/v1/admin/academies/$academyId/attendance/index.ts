import { createFileRoute } from "@tanstack/react-router";

import { adminListAttendance } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/attendance/"
)({
  server: {
    handlers: {
      GET: adminListAttendance,
    },
  },
});
