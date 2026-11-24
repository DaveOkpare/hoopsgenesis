import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { AdminMemberScreen } from "@/features/member-detail/admin-member-screen";
import {
  type DetailSearch,
  parseDetailSearch,
} from "@/features/member-detail/common";
import { useActiveMembership } from "@/features/viewer/queries";

/**
 * One member, story AO-3: student (Paper 8JO-0, 7F2-0) or coach (DNS-0, CHQ-0).
 * `$memberId` takes the user id (what rosters, fees and records carry) or the member id.
 */
export const Route = createFileRoute("/_auth/admin/members/$memberId")({
  validateSearch: parseDetailSearch,
  component: MemberDetailPage,
});

function MemberDetailPage() {
  const { memberId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;
  const handleSearchChange = useCallback(
    (patch: Partial<DetailSearch>) => {
      // Opening a dialog is a step (Back closes it); closing and month switches replace.
      const opens = patch.action !== undefined;
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace: !opens });
    },
    [navigate]
  );
  if (!academy) {
    return null;
  }
  return (
    <AdminMemberScreen
      academyId={academy.id}
      key={memberId}
      memberId={memberId}
      onSearchChange={handleSearchChange}
      search={search}
      timeZone={academy.timezone}
    />
  );
}
