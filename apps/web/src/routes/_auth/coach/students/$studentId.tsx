import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CoachStudentScreen } from "@/features/member-detail/coach-student-screen";
import {
  type DetailSearch,
  parseDetailSearch,
} from "@/features/member-detail/common";
import { useActiveMembership } from "@/features/viewer/queries";

/**
 * A coach's view of one student on their team, stories CO-7 and CO-10 (Paper DTR-0 web,
 * CB8-0 phone). `$studentId` is the student's user id. Students on other teams are a 404.
 */
export const Route = createFileRoute("/_auth/coach/students/$studentId")({
  validateSearch: parseDetailSearch,
  component: StudentDetailPage,
});

function StudentDetailPage() {
  const { studentId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const academy = useActiveMembership()?.academy;
  const handleSearchChange = useCallback(
    (patch: Partial<DetailSearch>) => {
      const opens = patch.action !== undefined;
      navigate({ search: (prev) => ({ ...prev, ...patch }), replace: !opens });
    },
    [navigate]
  );
  if (!academy) {
    return null;
  }
  return (
    <CoachStudentScreen
      academyId={academy.id}
      key={studentId}
      onSearchChange={handleSearchChange}
      search={search}
      studentId={studentId}
      timeZone={academy.timezone}
    />
  );
}
