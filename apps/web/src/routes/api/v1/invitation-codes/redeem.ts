import { createFileRoute } from "@tanstack/react-router";

import { redeemInvitationCode } from "@/server/api/v1/invitation-codes";

export const Route = createFileRoute("/api/v1/invitation-codes/redeem")({
  server: {
    handlers: {
      POST: redeemInvitationCode,
    },
  },
});
