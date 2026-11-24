import { createFileRoute, redirect } from "@tanstack/react-router";

import { AuthLayout } from "@/components/auth-layout";
import { WelcomeScreen } from "@/features/join-codes/welcome-screen";
import { useViewer } from "@/features/viewer/queries";
import { homePathFor } from "@/features/viewer/selectors";
import { isUiPreview } from "@/lib/preview";

/*
 * Signed in, no academy yet (Paper 89U-0 / 8B0-0). Under /_auth for the session guard:
 * signed out goes to /login. Anyone who does have an academy (or is the owner) is sent
 * to their home; preview mode always shows the screen (its personas all have one).
 */
export const Route = createFileRoute("/_auth/welcome")({
  beforeLoad: ({ context }) => {
    const home = homePathFor(context.viewer);
    if (!isUiPreview && home !== "/welcome") {
      throw redirect({ to: home });
    }
  },
  head: () => ({ meta: [{ title: "Join your academy · Hoops Genesis" }] }),
  component: WelcomePage,
});

function WelcomePage() {
  const viewer = useViewer();
  return (
    <AuthLayout>
      <WelcomeScreen email={viewer.user.email} />
    </AuthLayout>
  );
}
