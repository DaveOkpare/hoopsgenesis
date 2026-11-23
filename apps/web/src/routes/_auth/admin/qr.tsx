import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  AcademyQrScreen,
  parseQrSearch,
  type QrSearch,
} from "@/features/academy-qr/academy-qr-screen";

export const Route = createFileRoute("/_auth/admin/qr")({
  validateSearch: parseQrSearch,
  component: QrPage,
});

function QrPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<QrSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <AcademyQrScreen onSearchChange={handleSearchChange} search={search} />
  );
}
