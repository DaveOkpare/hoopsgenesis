import { createFileRoute } from "@tanstack/react-router";

import { adminGetAttendance } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/attendance/$id"
)({
  server: {
    handlers: {
      GET: adminGetAttendance,
    },
  },
});
