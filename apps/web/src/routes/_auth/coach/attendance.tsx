import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CoachAttendanceScreen } from "@/features/attendance/coach-attendance-screen";
import {
  type AttendanceSearch,
  parseAttendanceSearch,
} from "@/features/attendance/search";

export const Route = createFileRoute("/_auth/coach/attendance")({
  validateSearch: parseAttendanceSearch,
  component: AttendancePage,
});

function AttendancePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<AttendanceSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <CoachAttendanceScreen
      onSearchChange={handleSearchChange}
      search={search}
    />
  );
}
