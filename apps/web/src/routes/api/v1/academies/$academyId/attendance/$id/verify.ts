import { createFileRoute } from "@tanstack/react-router";

import {
  unverifyAttendance,
  verifyAttendance,
} from "@/server/api/v1/attendance";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/attendance/$id/verify"
)({
  server: {
    handlers: {
      POST: verifyAttendance,
      DELETE: unverifyAttendance,
    },
  },
});
