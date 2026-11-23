import { createFileRoute } from "@tanstack/react-router";

import { scanAttendance } from "@/server/api/v1/scan";

export const Route = createFileRoute("/api/v1/attendance/scan")({
  server: {
    handlers: {
      POST: scanAttendance,
    },
  },
});
