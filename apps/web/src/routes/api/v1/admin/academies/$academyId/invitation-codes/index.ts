import { createFileRoute } from "@tanstack/react-router";

import {
  adminCreateInvitationCode,
  adminListInvitationCodes,
} from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute(
  "/api/v1/admin/academies/$academyId/invitation-codes/"
)({
  server: {
    handlers: {
      GET: adminListInvitationCodes,
      POST: adminCreateInvitationCode,
    },
  },
});
