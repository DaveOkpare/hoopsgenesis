import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { FeesScreen } from "@/features/fees/fees-screen";
import { type FeesSearch, parseFeesSearch } from "@/features/fees/search";

export const Route = createFileRoute("/_auth/admin/fees")({
  validateSearch: parseFeesSearch,
  component: FeesPage,
});

function FeesPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<FeesSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return <FeesScreen onSearchChange={handleSearchChange} search={search} />;
}
