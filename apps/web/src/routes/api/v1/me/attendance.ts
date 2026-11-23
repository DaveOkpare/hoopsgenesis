import { createFileRoute } from "@tanstack/react-router";

import { listMyAttendance } from "@/server/api/v1/attendance";

export const Route = createFileRoute("/api/v1/me/attendance")({
  server: {
    handlers: {
      GET: listMyAttendance,
    },
  },
});
