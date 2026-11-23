import { createFileRoute } from "@tanstack/react-router";

import { adminListStudentRecords } from "@/server/api/v1/admin-academy-views";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/students/$studentId/records"
)({
  server: {
    handlers: {
      GET: adminListStudentRecords,
    },
  },
});
