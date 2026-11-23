import { createFileRoute } from "@tanstack/react-router";

import { bulkVerifyAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/verify"
)({
  server: {
    handlers: {
      POST: bulkVerifyAttendance,
    },
  },
});
