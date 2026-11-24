import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

import { CalendarScreen } from "@/features/calendar/calendar-screen";
import {
  type CalendarSearch,
  parseCalendarSearch,
} from "@/features/calendar/search";

export const Route = createFileRoute("/_auth/coach/calendar/")({
  validateSearch: parseCalendarSearch,
  component: CalendarPage,
});

function CalendarPage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const handleSearchChange = useCallback(
    (patch: Partial<CalendarSearch>) => {
      navigate({
        search: (previous) => ({ ...previous, ...patch }),
        replace: true,
      });
    },
    [navigate]
  );
  return (
    <CalendarScreen
      audience="coach"
      onSearchChange={handleSearchChange}
      search={search}
    />
  );
}
