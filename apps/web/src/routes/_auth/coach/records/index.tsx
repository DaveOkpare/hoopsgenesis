import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  parseReviewSearch,
  ReviewQueueScreen,
  type ReviewSearch,
} from "@/features/records/review-queue";

export const Route = createFileRoute("/_auth/coach/records/")({
  validateSearch: parseReviewSearch,
  component: RecordsPage,
});

function RecordsPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<ReviewSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <ReviewQueueScreen
      onSearchChange={handleSearchChange}
      scope="coach"
      search={search}
    />
  );
}
