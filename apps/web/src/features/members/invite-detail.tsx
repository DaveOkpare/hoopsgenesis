import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Badge } from "@hoops-genesis/ui/components/badge";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft } from "lucide-react";
import { useCallback } from "react";
import { toast } from "sonner";
import {
  copyInviteLink,
  NO_EMAIL_NOTE,
  renewedToast,
} from "@/features/members/invite-link";
import {
  invitationsQueryOptions,
  membersQueryOptions,
  platformOwnerQueryOptions,
  useCancelInvitation,
  useReferenceNow,
  useResendInvitation,
} from "@/features/members/queries";
import { teamListQueryOptions } from "@/features/teams/queries";
import type { Id, Invitation } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import { errorMessage } from "@/lib/api-client";

const MS_PER_DAY = 86_400_000;
const EMAIL_NAME_BREAK = /[._-]/;
const ROLE_LABEL = { admin: "Admin", coach: "Coach", student: "Student" };

/** "Sat 14 Nov". */
function weekdayDayMonth(value: string, timeZone?: string): string {
  const date = new Date(value);
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
  }).format(date);
  const day = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
  }).format(date);
  const month = new Intl.DateTimeFormat("en-US", {
    timeZone,
    month: "short",
  }).format(date);
  return `${weekday} ${day} ${month}`;
}

/** "sarah.k@example.com" -> "Sarah": how the note names someone with no account. */
function nameFromEmail(email: string): string {
  const [first = email] = email.split("@")[0]?.split(EMAIL_NAME_BREAK) ?? [];
  return first.charAt(0).toUpperCase() + first.slice(1);
}

function DetailRow({
  label,
  value,
  tone = "ink",
}: {
  label: string;
  value: string;
  tone?: "ink" | "alert";
}) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-3 text-[15px] leading-5 last:border-b-0">
      <dt className="text-muted">{label}</dt>
      <dd
        className={
          tone === "alert"
            ? "font-semibold text-orange-deep"
            : "font-medium text-ink"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function BackToInvites({ onBack }: { onBack: () => void }) {
  return (
    <button
      className="-ml-2 flex min-h-11 w-fit cursor-pointer items-center gap-1 rounded-sm px-2 font-medium text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
      onClick={onBack}
      type="button"
    >
      <ChevronLeft aria-hidden="true" className="size-4" strokeWidth={1.8} />
      Invites
    </button>
  );
}

function useInviterName(invite: Invitation | undefined, academyId: Id) {
  const viewer = useViewer();
  const members = useQuery({
    ...membersQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const owner = useQuery({
    ...platformOwnerQueryOptions(),
    throwOnError: false,
  }).data;
  if (!invite) {
    return "";
  }
  if (invite.inviterId === viewer.user.id) {
    return viewer.user.name;
  }
  if (owner && owner.id === invite.inviterId) {
    return owner.name;
  }
  return (
    members?.find((m) => m.userId === invite.inviterId)?.user.name ?? "An admin"
  );
}

/**
 * One pending or expired invite (GPF-0, story AO-2): who it is for, the team and role it
 * joins as, who sent it and when it stops working, with Resend and Cancel. Phone design;
 * wider screens show it in the same single column. The invite link itself is not shown
 * (the design leaves it out).
 */
export function InviteDetail({
  academyId,
  invitationId,
  timeZone,
  onBack,
}: {
  academyId: Id;
  invitationId: Id;
  timeZone?: string;
  onBack: () => void;
}) {
  const now = useReferenceNow();
  const invites = useQuery(invitationsQueryOptions(academyId)).data;
  const teams = useQuery({
    ...teamListQueryOptions(academyId),
    throwOnError: false,
  }).data;
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();
  const invite = invites?.find((i) => i.id === invitationId);
  const inviterName = useInviterName(invite, academyId);

  const handleResend = useCallback(() => {
    resend.mutate(
      { academyId, invitationId },
      {
        onSuccess: (renewed) => renewedToast(renewed),
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't renew the invite. Try again.")
          ),
      }
    );
  }, [resend, academyId, invitationId]);
  const handleCopy = useCallback(
    () => copyInviteLink(invitationId),
    [invitationId]
  );
  const handleCancel = useCallback(() => {
    cancel.mutate(
      { academyId, invitationId },
      {
        onSuccess: (gone) => {
          toast.success(`Invite to ${gone.email} cancelled`);
          onBack();
        },
        onError: (error) =>
          toast.error(
            errorMessage(error, "Couldn't cancel the invite. Try again.")
          ),
      }
    );
  }, [cancel, academyId, invitationId, onBack]);

  if (!invites) {
    return (
      <div aria-busy="true" className="flex max-w-prose flex-col gap-[18px]">
        <BackToInvites onBack={onBack} />
        <Skeleton className="h-11 w-64" />
        <Skeleton className="h-[220px] rounded-[20px]" />
      </div>
    );
  }
  if (!invite) {
    return (
      <div className="flex max-w-prose flex-col gap-[18px]">
        <BackToInvites onBack={onBack} />
        <Empty className="flex-none items-start py-6 text-left">
          <EmptyHeader className="items-start text-left">
            <EmptyTitle className="text-[28px] max-md:text-[24px]">
              This invite is closed
            </EmptyTitle>
            <EmptyDescription className="text-[15px]">
              It was accepted or cancelled. Find the person under Members, or
              create a new invite.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </div>
    );
  }

  const expired = invite.status === "expired";
  const team = teams?.find((t) => t.team.id === invite.teamId);
  const teamLabel = team
    ? [team.team.name, team.sport].filter(Boolean).join(" · ")
    : "No team";
  const daysSince = Math.max(
    0,
    Math.floor((now.getTime() - Date.parse(invite.expiresAt)) / MS_PER_DAY)
  );
  let expiredLabel = `Expired ${daysSince} days ago`;
  if (daysSince === 0) {
    expiredLabel = "Expired today";
  } else if (daysSince === 1) {
    expiredLabel = "Expired yesterday";
  }
  const teamWaits =
    invite.role === "coach" && team && team.coaches.length === 0
      ? `${team.team.name} has no coach until ${nameFromEmail(invite.email)} joins. `
      : "";
  const busy = resend.isPending || cancel.isPending;

  return (
    <div className="flex max-w-prose flex-col gap-[18px]">
      <div className="flex flex-col gap-3">
        <BackToInvites onBack={onBack} />
        <div className="flex items-center gap-3">
          <Avatar className="size-11" size={44} tone="placeholder">
            <AvatarFallback>?</AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-col gap-0.5">
            <h1 className="truncate font-semibold text-[17px] text-ink leading-[22px]">
              {invite.email}
            </h1>
            <p className="text-muted text-sm leading-[18px]">
              Hasn’t joined yet
            </p>
          </div>
        </div>
        <Badge
          className="px-[11px] py-[5px]"
          variant={expired ? "warning" : "neutral"}
        >
          {expired
            ? expiredLabel
            : `Pending · works until ${weekdayDayMonth(invite.expiresAt, timeZone)}`}
        </Badge>
      </div>
      <dl className="flex flex-col">
        <DetailRow label="Joins as" value={ROLE_LABEL[invite.role]} />
        <DetailRow label="Team" value={teamLabel} />
        <DetailRow label="Created by" value={inviterName} />
        <DetailRow
          label="Created"
          value={weekdayDayMonth(invite.createdAt, timeZone)}
        />
        <DetailRow
          label={expired ? "Stopped working" : "Works until"}
          tone={expired ? "alert" : "ink"}
          value={weekdayDayMonth(invite.expiresAt, timeZone)}
        />
      </dl>
      <p className="rounded-md bg-fog px-4 py-[14px] text-ink-soft text-sm leading-5">
        {teamWaits}
        {NO_EMAIL_NOTE} Renewing makes the link work for another 48 hours.
      </p>
      <div className="flex flex-col gap-2">
        {expired ? null : (
          <Button className="w-full" disabled={busy} onClick={handleCopy}>
            Copy invite link
          </Button>
        )}
        <Button
          className="w-full"
          disabled={busy}
          onClick={handleResend}
          variant={expired ? "default" : "outline"}
        >
          {resend.isPending ? "Renewing…" : "Renew invite"}
        </Button>
        <Button
          className="w-full text-orange-deep"
          disabled={busy}
          onClick={handleCancel}
          variant="outline"
        >
          {cancel.isPending ? "Cancelling…" : "Cancel invite"}
        </Button>
      </div>
    </div>
  );
}
