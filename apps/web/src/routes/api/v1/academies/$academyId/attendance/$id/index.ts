import { createFileRoute } from "@tanstack/react-router";

import { getAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/$id/"
)({
  server: {
    handlers: {
      GET: getAttendance,
    },
  },
});
