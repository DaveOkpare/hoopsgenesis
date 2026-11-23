import { createFileRoute } from "@tanstack/react-router";

import { revokeInvitationCode } from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/invitation-codes/$id/revoke"
)({
  server: {
    handlers: {
      POST: revokeInvitationCode,
    },
  },
});
