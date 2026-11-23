import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  CreateTeamDialog,
  type CreateTeamNextStep,
} from "@/features/teams/create-team-dialog";
import { TeamsScreen } from "@/features/teams/teams-screen";
import type { Team } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";

interface TeamsSearch {
  /** `?create=1` opens Create team (75J-0, phone 7DB-0). */
  create?: 1;
  /** `?empty=1` previews the empty state (1UZ-0) even though fixtures have teams. */
  empty?: 1;
}

function isOne(value: unknown): boolean {
  return value === 1 || value === "1" || value === true;
}

export const Route = createFileRoute("/_auth/admin/teams/")({
  validateSearch: (search: Record<string, unknown>): TeamsSearch => ({
    ...(isOne(search.create) ? { create: 1 } : {}),
    ...(isOne(search.empty) ? { empty: 1 } : {}),
  }),
  component: TeamsPage,
});

/** Teams, story AO-3 (Paper 72W-0 list, 1UZ-0 empty state, 75J-0 / 7DB-0 Create team). */
function TeamsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;
  const setCreateOpen = useCallback(
    (open: boolean) => {
      navigate({
        search: (prev) => ({ ...prev, create: open ? 1 : undefined }),
        replace: !open,
      });
    },
    [navigate]
  );
  const openCreate = useCallback(() => setCreateOpen(true), [setCreateOpen]);
  const handleCreated = useCallback(
    (team: Team, next: CreateTeamNextStep | null) => {
      if (next === "invite") {
        navigate({
          to: "/admin/members",
          search: { invite: 1, role: "student" },
        });
        return;
      }
      if (next) {
        // Join codes have no screen of their own yet, so "join-code" and "add-existing"
        // both land on the new team's page, where students are added.
        navigate({
          to: "/admin/teams/$teamId",
          params: { teamId: team.id },
          search: next === "add-existing" ? { add: "" } : {},
        });
        return;
      }
      setCreateOpen(false);
    },
    [navigate, setCreateOpen]
  );
  if (!academy) {
    return null;
  }
  return (
    <>
      <TeamsScreen
        academyId={academy.id}
        forceEmpty={search.empty === 1}
        onCreate={openCreate}
      />
      <CreateTeamDialog
        academyId={academy.id}
        onCreated={handleCreated}
        onOpenChange={setCreateOpen}
        open={search.create === 1}
      />
    </>
  );
}
