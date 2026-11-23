import { createFileRoute } from "@tanstack/react-router";

import { createAttendance, listAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/"
)({
  server: {
    handlers: {
      GET: listAttendance,
      POST: createAttendance,
    },
  },
});
