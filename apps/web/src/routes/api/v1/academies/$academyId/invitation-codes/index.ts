import { createFileRoute } from "@tanstack/react-router";

import {
  createInvitationCode,
  listInvitationCodes,
} from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute(
  "/api/v1/academies/$academyId/invitation-codes/"
)({
  server: {
    handlers: {
      GET: listInvitationCodes,
      POST: createInvitationCode,
    },
  },
});
