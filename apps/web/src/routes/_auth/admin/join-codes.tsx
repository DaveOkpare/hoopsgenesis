import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  JoinCodesScreen,
  type MembersSection,
} from "@/features/join-codes/join-codes-screen";
import { NewCodeDialog } from "@/features/join-codes/new-code-dialog";
import {
  type InvitationCode,
  joinCodesQueryOptions,
} from "@/features/join-codes/queries";
import { RevokeDialog } from "@/features/join-codes/revoke-dialog";
import type { Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";

/*
 * Deep links:
 *   ?code=<id>      select a code (desktop panel; phone bottom sheet), e.g. ?code=code-k7pm
 *   ?new=1          "New join code" (6AE-0); add &teamId=<id> to preselect a team
 *   ?created=<id>   "Code ready" for that code (6RV-0 / phone 6WV-0)
 *   ?revoke=<id>    confirm revoking that code
 */
interface JoinCodesSearch {
  code?: Id;
  created?: Id;
  new?: 1;
  revoke?: Id;
  /** With `new`: the team to preselect. */
  teamId?: Id;
}

function idParam(value: unknown): Id | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

export const Route = createFileRoute("/_auth/admin/join-codes")({
  validateSearch: (search: Record<string, unknown>): JoinCodesSearch => {
    const out: JoinCodesSearch = {};
    const code = idParam(search.code);
    const created = idParam(search.created);
    const revoke = idParam(search.revoke);
    if (code) {
      out.code = code;
    }
    if (created) {
      out.created = created;
    } else if (search.new === 1 || search.new === "1" || search.new === true) {
      out.new = 1;
      const teamId = idParam(search.teamId);
      if (teamId) {
        out.teamId = teamId;
      }
    }
    if (revoke) {
      out.revoke = revoke;
    }
    return out;
  },
  head: () => ({ meta: [{ title: "Join codes · Hoops Genesis" }] }),
  component: JoinCodesPage,
});

/** Members → Join codes, story AO-2 (Paper 6G1-0, 6AE-0, 6RV-0; phone 6WV-0). */
function JoinCodesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;
  const codes = useQuery({
    ...joinCodesQueryOptions(academy?.id ?? ""),
    enabled: Boolean(academy),
  }).data;

  const setSearch = useCallback(
    (patch: Partial<JoinCodesSearch>, replace = true) =>
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace }),
    [navigate]
  );
  const select = useCallback(
    (id: Id | null) => setSearch({ code: id ?? undefined }),
    [setSearch]
  );
  const openNew = useCallback(
    () => setSearch({ new: 1, created: undefined }, false),
    [setSearch]
  );
  const handleCreated = useCallback(
    (code: InvitationCode) =>
      setSearch({ new: undefined, teamId: undefined, created: code.id }),
    [setSearch]
  );
  const handleNewOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        setSearch({ new: undefined, teamId: undefined, created: undefined });
      }
    },
    [setSearch]
  );
  const openRevoke = useCallback(
    (id: Id) => setSearch({ revoke: id }, false),
    [setSearch]
  );
  const handleRevokeOpen = useCallback(
    (open: boolean) => {
      if (!open) {
        setSearch({ revoke: undefined });
      }
    },
    [setSearch]
  );
  const goToSection = useCallback(
    (section: MembersSection) => {
      if (section === "join-codes") {
        return;
      }
      navigate({
        to: "/admin/members",
        search: section === "invites" ? { tab: "invites" } : {},
      });
    },
    [navigate]
  );

  if (!academy) {
    return null;
  }
  const createdCode = codes?.find((c) => c.id === search.created) ?? null;
  const revokeCode = codes?.find((c) => c.id === search.revoke) ?? null;

  return (
    <>
      <JoinCodesScreen
        academyId={academy.id}
        academyName={academy.name}
        onNew={openNew}
        onRevoke={openRevoke}
        onSection={goToSection}
        onSelect={select}
        selectedId={search.code ?? null}
        timeZone={academy.timezone}
      />
      <NewCodeDialog
        academyId={academy.id}
        academyName={academy.name}
        createdCode={createdCode}
        initialTeamId={search.teamId}
        onCreated={handleCreated}
        onOpenChange={handleNewOpen}
        open={search.new === 1 || createdCode !== null}
        timeZone={academy.timezone}
      />
      <RevokeDialog
        academyId={academy.id}
        code={revokeCode}
        onOpenChange={handleRevokeOpen}
        open={Boolean(search.revoke)}
      />
    </>
  );
}
