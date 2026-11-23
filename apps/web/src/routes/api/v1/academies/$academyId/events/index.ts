import { createFileRoute } from "@tanstack/react-router";

import { createEvent, listEvents } from "@/server/api/v1/events";

export const Route = createFileRoute("/api/v1/academies/$academyId/events/")({
  server: {
    handlers: {
      GET: listEvents,
      POST: createEvent,
    },
  },
});
