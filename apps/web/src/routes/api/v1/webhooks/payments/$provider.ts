import { createFileRoute } from "@tanstack/react-router";

import { handlePaymentWebhook } from "@/server/api/v1/payment-webhook";

export const Route = createFileRoute("/api/v1/webhooks/payments/$provider")({
  server: {
    handlers: {
      POST: handlePaymentWebhook,
    },
  },
});
