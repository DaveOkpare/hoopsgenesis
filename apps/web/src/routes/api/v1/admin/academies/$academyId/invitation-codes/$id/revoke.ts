import { createFileRoute } from "@tanstack/react-router";

import { adminRevokeInvitationCode } from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/invitation-codes/$id/revoke"
)({
  server: {
    handlers: {
      POST: adminRevokeInvitationCode,
    },
  },
});
