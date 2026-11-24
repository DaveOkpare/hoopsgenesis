import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { AdminAttendanceScreen } from "@/features/attendance/admin-attendance-screen";
import {
  type AttendanceSearch,
  parseAttendanceSearch,
} from "@/features/attendance/search";

export const Route = createFileRoute("/_auth/admin/attendance")({
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
    <AdminAttendanceScreen
      onSearchChange={handleSearchChange}
      search={search}
    />
  );
}
