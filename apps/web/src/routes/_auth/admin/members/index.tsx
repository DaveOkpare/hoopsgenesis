import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { InviteDetail } from "@/features/members/invite-detail";
import { InviteDialog } from "@/features/members/invite-dialog";
import { MembersScreen } from "@/features/members/members-screen";
import {
  type MembersSearch,
  parseMembersSearch,
} from "@/features/members/search";
import { useActiveMembership } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/admin/members/")({
  validateSearch: parseMembersSearch,
  component: MembersPage,
});

/**
 * Members and invites, stories AO-2 and AO-3 (Paper 1I2-0, A2T-0, G8Q-0, BPI-0; invite
 * dialog 2HB-0 / 5U1-0; pending invite GPF-0 at `?invite=<invitationId>`).
 */
function MembersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;

  const handleSearchChange = useCallback(
    (patch: Partial<MembersSearch>) => {
      // Opening an invite is a step forward (Back returns to the list); filters replace.
      const opensInvite = typeof patch.invite === "string";
      navigate({
        search: (prev) => ({ ...prev, ...patch }),
        replace: !opensInvite,
      });
    },
    [navigate]
  );
  const setInviteOpen = useCallback(
    (open: boolean) => {
      navigate({
        search: (prev) => ({
          ...prev,
          invite: open ? 1 : undefined,
          role: open ? prev.role : undefined,
        }),
        replace: !open,
      });
    },
    [navigate]
  );
  const openInvite = useCallback(() => setInviteOpen(true), [setInviteOpen]);
  const closeInviteDetail = useCallback(() => {
    navigate({
      search: (prev) => ({ ...prev, invite: undefined, tab: "invites" }),
      replace: true,
    });
  }, [navigate]);

  if (!academy) {
    return null;
  }
  const invitationId = typeof search.invite === "string" ? search.invite : null;
  if (invitationId) {
    return (
      <InviteDetail
        academyId={academy.id}
        invitationId={invitationId}
        key={invitationId}
        onBack={closeInviteDetail}
        timeZone={academy.timezone}
      />
    );
  }
  return (
    <>
      <MembersScreen
        academyId={academy.id}
        onInvite={openInvite}
        onSearchChange={handleSearchChange}
        search={search}
        timeZone={academy.timezone}
      />
      <InviteDialog
        academyId={academy.id}
        defaultRole={search.role ?? "student"}
        onOpenChange={setInviteOpen}
        open={search.invite === 1}
      />
    </>
  );
}
