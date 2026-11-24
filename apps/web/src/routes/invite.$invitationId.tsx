import { Button } from "@hoops-genesis/ui/components/button";
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import z from "zod";

import {
  AuthBackContent,
  AuthTitle,
  authBackClass,
  authSubmitClass,
} from "@/components/auth/auth-parts";
import { AuthLayout } from "@/components/auth-layout";
import { BrandMark } from "@/components/brand-mark";
import SignUpForm from "@/components/sign-up-form";
import { InviteBanner } from "@/features/invitations/components/invite-banner";
import {
  InviteNotice,
  WrongAccountNotice,
} from "@/features/invitations/components/invite-notice";
import { JoinedView } from "@/features/invitations/components/joined-view";
import { formatInviteDeadline } from "@/features/invitations/format";
import {
  type InvitationDetails,
  invitationQueryOptions,
  joinSummaryQueryOptions,
  useAcceptInvitation,
} from "@/features/invitations/queries";
import { errorMessage } from "@/lib/api-client";

/** `state=joined` shows "You're in" (set after the invite is accepted). */
const searchSchema = z.object({
  state: z.enum(["joined"]).optional().catch(undefined),
});

export const Route = createFileRoute("/invite/$invitationId")({
  // The invitation is read with the visitor's session cookie, on the client.
  ssr: false,
  validateSearch: searchSchema,
  loaderDeps: ({ search }) => ({ state: search.state }),
  loader: async ({ context, params, deps }) => {
    const { invitationId } = params;
    await (deps.state === "joined"
      ? context.queryClient.ensureQueryData(
          joinSummaryQueryOptions(invitationId)
        )
      : context.queryClient.ensureQueryData(
          invitationQueryOptions(invitationId)
        ));
  },
  head: () => ({ meta: [{ title: "Your invite · Hoops Genesis" }] }),
  component: InvitePage,
});

/** Accept, then show "You're in"; on failure say why. */
function useAcceptAndContinue(invitationId: string) {
  const navigate = useNavigate();
  const acceptInvitation = useAcceptInvitation();
  const accept = useCallback(async () => {
    try {
      await acceptInvitation.mutateAsync({ invitationId });
      await navigate({
        to: "/invite/$invitationId",
        params: { invitationId },
        search: { state: "joined" },
        replace: true,
      });
    } catch (error) {
      toast.error(errorMessage(error, "Couldn't accept the invite."));
    }
  }, [acceptInvitation, invitationId, navigate]);
  return { accept, isPending: acceptInvitation.isPending };
}

/*
 * Create an account from an invite (ST-1).
 * Pending: 62J-0 (web) / 62L-0 (390). Joined: 59H-0. Expired: 5BQ-0.
 * Preview fixture ids: invite-aline (pending), invite-aline-expired,
 * invite-aline-accepted; anything else is "not valid". Add ?state=joined for the joined
 * screen. Real mode: a signed-out visitor can't read the invitation (Better Auth only
 * shows it to the signed-in recipient), so they get the sign-up form without details.
 */
function InvitePage() {
  const { invitationId } = Route.useParams();
  const { state } = Route.useSearch();

  if (state === "joined") {
    return (
      <AuthLayout tone="orange">
        <JoinedView invitationId={invitationId} />
      </AuthLayout>
    );
  }
  return <InviteLookup invitationId={invitationId} />;
}

function InviteLookup({ invitationId }: { invitationId: string }) {
  const { data: lookup } = useSuspenseQuery(
    invitationQueryOptions(invitationId)
  );
  switch (lookup.kind) {
    case "signed-out":
      return (
        <AuthLayout width="wide">
          <CreateAccount invitation={null} invitationId={invitationId} />
        </AuthLayout>
      );
    case "wrong-account":
      return (
        <AuthLayout>
          <WrongAccountNotice
            invitationId={invitationId}
            signedInAs={lookup.signedInAs}
          />
        </AuthLayout>
      );
    case "not-found":
      return (
        <AuthLayout>
          <InviteNotice invitation={null} signedIn={lookup.signedIn} />
        </AuthLayout>
      );
    default:
      break;
  }
  const { invitation } = lookup;
  if (invitation.status !== "pending") {
    return (
      <AuthLayout>
        <InviteNotice invitation={invitation} signedIn={lookup.signedIn} />
      </AuthLayout>
    );
  }
  if (lookup.signedIn) {
    return (
      <AuthLayout>
        <AcceptInvite invitation={invitation} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout width="wide">
      <CreateAccount invitation={invitation} invitationId={invitationId} />
    </AuthLayout>
  );
}

function CreateAccount({
  invitation,
  invitationId,
}: {
  /** Null when the visitor is signed out and the invitation can't be read. */
  invitation: InvitationDetails | null;
  invitationId: string;
}) {
  const { accept } = useAcceptAndContinue(invitationId);
  return (
    <SignUpForm
      email={invitation?.email}
      header={
        <>
          <Link className={authBackClass} search={{ invitationId }} to="/login">
            <AuthBackContent label="Back to sign in" />
          </Link>
          {invitation ? (
            <InviteBanner invitation={invitation} />
          ) : (
            <GenericInviteBanner />
          )}
          <div className="flex flex-col gap-2">
            <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
              Create your account
            </AuthTitle>
            <p className="text-[15px] text-muted leading-[22px] max-md:hidden">
              {invitation
                ? `This invite works until ${formatInviteDeadline(
                    invitation.expiresAt,
                    invitation.academyTimezone
                  )}.`
                : "Use the email address the invite is for. Your invite is accepted as soon as the account is made."}
            </p>
          </div>
        </>
      }
      invitationId={invitationId}
      onSignedUp={accept}
    />
  );
}

/** Signed out: the invite's academy and role can't be shown until the person signs in. */
function GenericInviteBanner() {
  return (
    <section
      aria-label="Your invite"
      className="flex items-center gap-[14px] rounded-[18px] bg-orange-soft p-[14px] max-md:gap-3 max-md:p-3"
    >
      <BrandMark
        className="text-lg leading-[22px] max-md:size-10 max-md:text-base max-md:leading-5"
        size={44}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <p className="font-semibold text-[15px] text-ink leading-5">
          A Hoops Genesis invite link
        </p>
        <p className="text-[13px] text-ink-soft leading-[18px]">
          Which academy it's for shows once you're signed in with the invited
          email.
        </p>
      </div>
    </section>
  );
}

/** Signed in as the invited person: one tap to join. */
function AcceptInvite({ invitation }: { invitation: InvitationDetails }) {
  const { accept, isPending } = useAcceptAndContinue(invitation.id);
  return (
    <div className="flex flex-col gap-[22px] max-md:flex-1 max-md:justify-between">
      <div className="flex flex-col gap-[22px]">
        <InviteBanner invitation={invitation} />
        <div className="flex flex-col gap-2">
          <AuthTitle className="max-md:text-[52px] max-md:leading-[50px]">
            Join {invitation.academyName}
          </AuthTitle>
          <p className="text-[15px] text-muted leading-[22px]">
            You're signed in as {invitation.email}. This invite works until{" "}
            {formatInviteDeadline(
              invitation.expiresAt,
              invitation.academyTimezone
            )}
            .
          </p>
        </div>
      </div>
      <Button
        className={authSubmitClass}
        disabled={isPending}
        onClick={accept}
        size="xl"
      >
        {isPending ? "Joining…" : "Accept and join"}
      </Button>
    </div>
  );
}
