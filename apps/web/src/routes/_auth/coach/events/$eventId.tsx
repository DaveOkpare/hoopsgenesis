import { createFileRoute } from "@tanstack/react-router";
import { useCallback } from "react";

import {
  EventDetailScreen,
  type EventDialog,
  validateEventSearch,
} from "@/features/events/components/event-detail-screen";
import { useSessionClock } from "@/features/sessions/clock";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/coach/events/$eventId")({
  validateSearch: validateEventSearch,
  component: EventPage,
});

/** Event detail for coaches (HLF-0 web, HWK-0 phone; camp EI2-0). */
function EventPage() {
  const { eventId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const membership = useActiveMembership();
  const now = useSessionClock();

  const openDialog = useCallback(
    (dialog: EventDialog, cancelDate?: string) =>
      navigate({
        search: (prev) => ({ ...prev, dialog, cancelDate }),
        replace: true,
      }),
    [navigate]
  );
  const closeDialog = useCallback(
    () =>
      navigate({
        search: (prev) => ({
          ...prev,
          dialog: undefined,
          cancelDate: undefined,
        }),
        replace: true,
      }),
    [navigate]
  );
  const handleDeleted = useCallback(
    () => navigate({ to: "/coach/calendar" }),
    [navigate]
  );

  if (!membership) {
    return null;
  }
  return (
    <EventDetailScreen
      cancelDate={search.cancelDate}
      dialog={search.dialog}
      eventId={eventId}
      key={eventId}
      membership={membership}
      now={now}
      onCloseDialog={closeDialog}
      onDeleted={handleDeleted}
      onOpenDialog={openDialog}
      staffRole="coach"
      userId={viewer.user.id}
    />
  );
}
