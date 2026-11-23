import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  AuthIconDisc,
  AuthTitle,
  authSubmitClass,
  ClockIcon,
} from "@/components/auth/auth-parts";
import { inviteLifetimeHours } from "@/features/invitations/format";
import type { InvitationDetails } from "@/features/invitations/queries";
import { useSignOut } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";
import { formatDayMonth } from "@/lib/format";

/**
 * Signed in with another email than the one invited: Better Auth shows an invitation
 * only to its recipient. Signing out brings back the create-account form.
 */
export function WrongAccountNotice({
  invitationId,
  signedInAs,
}: {
  invitationId: string;
  signedInAs: string;
}) {
  const router = useRouter();
  const signOut = useSignOut();
  const handleSignOut = useCallback(async () => {
    try {
      await signOut.mutateAsync();
    } catch (error) {
      toast.error(errorMessage(error, "Couldn’t sign out. Try again."));
      return;
    }
    await router.invalidate();
  }, [router, signOut]);
  return (
    <div className="flex flex-col gap-10 max-md:flex-1 max-md:justify-between max-md:pt-12">
      <div className="flex flex-col gap-[22px]">
        <AuthIconDisc>
          <ClockIcon />
        </AuthIconDisc>
        <AuthTitle>This invite is for someone else</AuthTitle>
        <p className="text-[17px] text-ink-soft leading-[25px]">
          You're signed in as{" "}
          <span className="font-semibold text-ink">{signedInAs}</span>, but this
          invite was sent to another email address. Sign out, then create your
          account or sign in with the invited email.
        </p>
      </div>
      <div className="flex flex-col gap-3">
        <Button
          className={authSubmitClass}
          disabled={signOut.isPending}
          onClick={handleSignOut}
          size="xl"
        >
          Sign out
        </Button>
        <Link
          className="text-center text-muted text-sm leading-[18px] underline"
          search={{ invitationId }}
          to="/login"
        >
          Sign in with the invited email
        </Link>
      </div>
    </div>
  );
}

/*
 * Invite links that can't be used: expired (Paper 5BQ-0), already accepted, or not found.
 * Same layout for all three; only the expired copy is from the design.
 */
export function InviteNotice({
  invitation,
}: {
  invitation: InvitationDetails | null;
}) {
  return (
    <div className="flex flex-col gap-10 max-md:flex-1 max-md:justify-between max-md:pt-12">
      <div className="flex flex-col gap-[22px]">
        <AuthIconDisc>
          <ClockIcon />
        </AuthIconDisc>
        <NoticeBody invitation={invitation} />
      </div>
      <div className="flex flex-col gap-3">
        <Link
          className={cn(buttonVariants({ size: "xl" }), authSubmitClass)}
          to="/login"
        >
          I already have an account
        </Link>
        <p className="text-center text-muted text-sm leading-[18px]">
          Signing in shows any invites that are still open.
        </p>
      </div>
    </div>
  );
}

const bodyClass = "text-[17px] text-ink-soft leading-[25px]";

function NoticeBody({ invitation }: { invitation: InvitationDetails | null }) {
  if (!invitation) {
    return (
      <>
        <AuthTitle>This invite link isn't valid</AuthTitle>
        <p className={bodyClass}>
          Check that you opened the whole link from the email, or ask your
          academy to send a new invite.
        </p>
      </>
    );
  }
  const email = (
    <span className="font-semibold text-ink">{invitation.email}</span>
  );
  if (invitation.status === "accepted") {
    return (
      <>
        <AuthTitle>This invite has been used</AuthTitle>
        <p className={bodyClass}>
          It was already accepted. Sign in with {email} to open{" "}
          {invitation.academyName}.
        </p>
      </>
    );
  }
  const hours = inviteLifetimeHours(invitation.createdAt, invitation.expiresAt);
  const sentOn = formatDayMonth(
    invitation.createdAt,
    invitation.academyTimezone
  );
  return (
    <>
      <AuthTitle>This invite has expired</AuthTitle>
      <p className={bodyClass}>
        Invite links work for {hours} hours. This one was sent to {email} on{" "}
        {sentOn}.
      </p>
      <div className="flex flex-col gap-1.5 rounded-[20px] bg-fog p-4">
        <p className="font-semibold text-[15px] text-ink leading-5">
          Ask for a new invite
        </p>
        <p className="text-muted text-sm leading-5">
          Your coach or the {invitation.academyName} front desk can send a fresh
          link in a few seconds.
        </p>
      </div>
    </>
  );
}
