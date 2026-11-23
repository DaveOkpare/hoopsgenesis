import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import { AuthTitle } from "@/components/auth/auth-parts";
import { AuthLayout } from "@/components/auth-layout";
import SignUpForm from "@/components/sign-up-form";
import { InviteBanner } from "@/features/invitations/components/invite-banner";
import { InviteNotice } from "@/features/invitations/components/invite-notice";
import { JoinedView } from "@/features/invitations/components/joined-view";
import { formatInviteDeadline } from "@/features/invitations/format";
import {
  type InvitationDetails,
  invitationQueryOptions,
  joinSummaryQueryOptions,
  useAcceptInvitation,
} from "@/features/invitations/queries";

/** `state=joined` shows "You're in" (set after the invite is accepted). */
const searchSchema = z.object({
  state: z.enum(["joined"]).optional().catch(undefined),
});

export const Route = createFileRoute("/invite/$invitationId")({
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ state: search.state }),
  loader: async ({ context, params, deps }) => {
    const { invitationId } = params;
    await Promise.all([
      context.queryClient.ensureQueryData(invitationQueryOptions(invitationId)),
      deps.state === "joined"
        ? context.queryClient.ensureQueryData(
            joinSummaryQueryOptions(invitationId)
          )
        : null,
    ]);
  },
  head: () => ({ meta: [{ title: "Your invite · Hoops Genesis" }] }),
  component: InvitePage,
});

/*
 * Create an account from an invite (ST-1).
 * Pending: 62J-0 (web) / 62L-0 (390). Joined: 59H-0. Expired: 5BQ-0.
 * Fixture ids: invite-aline (pending), invite-aline-expired, invite-aline-accepted;
 * anything else is "not valid". Add ?state=joined for the joined screen.
 */
function InvitePage() {
  const { invitationId } = Route.useParams();
  const { state } = Route.useSearch();
  const { data: invitation } = useSuspenseQuery(
    invitationQueryOptions(invitationId)
  );

  if (state === "joined") {
    return (
      <AuthLayout tone="orange">
        <JoinedView invitationId={invitationId} />
      </AuthLayout>
    );
  }
  if (invitation?.status !== "pending") {
    return (
      <AuthLayout>
        <InviteNotice invitation={invitation} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout width="wide">
      <CreateAccount invitation={invitation} />
    </AuthLayout>
  );
}

function CreateAccount({ invitation }: { invitation: InvitationDetails }) {
  const navigate = useNavigate();
  const acceptInvitation = useAcceptInvitation();

  const handleSignedUp = useCallback(async () => {
    try {
      await acceptInvitation.mutateAsync({ invitationId: invitation.id });
      await navigate({
        to: "/invite/$invitationId",
        params: { invitationId: invitation.id },
        search: { state: "joined" },
        replace: true,
      });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Couldn't accept the invite."
      );
    }
  }, [acceptInvitation, invitation.id, navigate]);

  return (
    <SignUpForm
      email={invitation.email}
      header={
        <>
          <InviteBanner invitation={invitation} />
          <div className="flex flex-col gap-2">
            <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
              Create your account
            </AuthTitle>
            <p className="text-[15px] text-muted leading-[22px] max-md:hidden">
              This invite works until{" "}
              {formatInviteDeadline(
                invitation.expiresAt,
                invitation.academyTimezone
              )}
              .
            </p>
          </div>
        </>
      }
      invitationId={invitation.id}
      onSignedUp={handleSignedUp}
    />
  );
}
