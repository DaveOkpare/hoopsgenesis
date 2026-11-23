import { createFileRoute } from "@tanstack/react-router";

import { previewInvitationCode } from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute("/api/v1/invitation-codes/preview")({
  server: {
    handlers: {
      POST: previewInvitationCode,
    },
  },
});
