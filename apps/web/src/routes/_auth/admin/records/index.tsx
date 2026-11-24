import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  AdminRecordsScreen,
  type AdminRecordsSearch,
  parseAdminRecordsSearch,
} from "@/features/records/admin-records";

export const Route = createFileRoute("/_auth/admin/records/")({
  validateSearch: parseAdminRecordsSearch,
  component: RecordsPage,
});

function RecordsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<AdminRecordsSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <AdminRecordsScreen onSearchChange={handleSearchChange} search={search} />
  );
}
