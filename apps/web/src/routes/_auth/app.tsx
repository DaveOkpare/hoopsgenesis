import { createFileRoute, redirect } from "@tanstack/react-router";

import { homePathFor } from "@/features/viewer/selectors";

/** After sign-in everyone lands here and is sent to their role's home. */
export const Route = createFileRoute("/_auth/app")({
  beforeLoad: ({ context }) => {
    throw redirect({ to: homePathFor(context.viewer) });
  },
});
