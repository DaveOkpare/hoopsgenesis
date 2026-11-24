/*
 * Invite links. The server has no email sender yet, so an invitation is only
 * created: whoever may see its id (an academy admin for coach and student
 * invitations, the platform owner for all) copies the link and sends it.
 */
import { toast } from "sonner";

import { copyWithToast } from "@/features/join-codes/copy";
import type { Id, Invitation } from "@/features/types";

/** Said wherever an invitation is created or renewed. */
export const NO_EMAIL_NOTE =
  "Email delivery isn’t switched on yet, so copy the invite link and send it yourself.";

/** `<origin>/invite/<invitationId>`: the page where the person accepts. */
export function inviteLink(invitationId: Id): string {
  return `${window.location.origin}/invite/${invitationId}`;
}

export function copyInviteLink(invitationId: Id): Promise<void> {
  return copyWithToast(inviteLink(invitationId), "Invite link copied");
}

/** After a renewal: the link works for 48 hours again, and nothing was emailed. */
export function renewedToast(invite: Invitation): void {
  toast.success(`Invite for ${invite.email} renewed for 48 hours.`, {
    description: NO_EMAIL_NOTE,
    action: { label: "Copy link", onClick: () => copyInviteLink(invite.id) },
  });
}
