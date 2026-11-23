import { createFileRoute } from "@tanstack/react-router";

import { voidAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/$id/void"
)({
  server: {
    handlers: {
      POST: voidAttendance,
    },
  },
});
