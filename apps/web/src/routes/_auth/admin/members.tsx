import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { InviteDialog } from "@/features/members/invite-dialog";
import {
  MembersScreen,
  type MembersTab,
} from "@/features/members/members-screen";
import type { InvitableRole } from "@/features/members/queries";
import { useActiveMembership } from "@/features/viewer/queries";

const TABS: readonly MembersTab[] = [
  "all",
  "students",
  "coaches",
  "admins",
  "invites",
];

interface MembersSearch {
  /** `?invite=1` opens the Invite people dialog (deep link from Dashboard and Setup). */
  invite?: 1;
  /** Role the invite form starts on (`?invite=1&role=coach` from the setup checklist). */
  role?: InvitableRole;
  tab?: MembersTab;
}

export const Route = createFileRoute("/_auth/admin/members")({
  validateSearch: (search: Record<string, unknown>): MembersSearch => {
    const out: MembersSearch = {};
    if (
      search.invite === 1 ||
      search.invite === "1" ||
      search.invite === true
    ) {
      out.invite = 1;
    }
    if (search.role === "coach" || search.role === "student") {
      out.role = search.role;
    }
    if (TABS.includes(search.tab as MembersTab) && search.tab !== "all") {
      out.tab = search.tab as MembersTab;
    }
    return out;
  },
  component: MembersPage,
});

/** Members and invites, stories AO-2 and AO-3 (Paper 1I2-0, 2HB-0; phone 5U1-0). */
function MembersPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;

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
  const setTab = useCallback(
    (tab: MembersTab) => {
      navigate({
        search: (prev) => ({ ...prev, tab: tab === "all" ? undefined : tab }),
        replace: true,
      });
    },
    [navigate]
  );

  if (!academy) {
    return null;
  }
  return (
    <>
      <MembersScreen
        academyId={academy.id}
        onInvite={openInvite}
        onTabChange={setTab}
        tab={search.tab ?? "all"}
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
