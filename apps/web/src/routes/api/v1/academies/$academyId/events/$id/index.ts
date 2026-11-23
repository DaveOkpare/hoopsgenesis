import { createFileRoute } from "@tanstack/react-router";

import { deleteEvent, getEvent, updateEvent } from "@/server/api/v1/events";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/events/$id/"
)({
  server: {
    handlers: {
      GET: getEvent,
      PATCH: updateEvent,
      DELETE: deleteEvent,
    },
  },
});
