import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  ActivityLogScreen,
  type ActivitySearch,
  parseActivitySearch,
} from "@/features/audit-log/activity-log-screen";

export const Route = createFileRoute("/_auth/admin/activity")({
  validateSearch: parseActivitySearch,
  component: ActivityLogPage,
});

function ActivityLogPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<ActivitySearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <ActivityLogScreen onSearchChange={handleSearchChange} search={search} />
  );
}
