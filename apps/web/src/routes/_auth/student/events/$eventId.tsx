import { createFileRoute } from "@tanstack/react-router";

import { StudentEventScreen } from "@/features/events/components/student-event-screen";
import { useSessionClock } from "@/features/sessions/clock";
import { useActiveMembership } from "@/features/viewer/queries";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface StudentEventSearch {
  /** The day of the event; defaults to the next one. */
  date?: string;
}

export const Route = createFileRoute("/_auth/student/events/$eventId")({
  validateSearch: (search: Record<string, unknown>): StudentEventSearch => ({
    date:
      typeof search.date === "string" && PLAIN_DATE.test(search.date)
        ? search.date
        : undefined,
  }),
  component: StudentEventPage,
});

/** Event detail for students (ST-8: G4Z-0 web, FFE-0 phone, FHQ-0 cancelled day). */
function StudentEventPage() {
  const { eventId } = Route.useParams();
  const { date } = Route.useSearch();
  const membership = useActiveMembership();
  const now = useSessionClock();
  if (!membership) {
    return null;
  }
  return (
    <StudentEventScreen
      date={date}
      eventId={eventId}
      key={`${eventId}:${date ?? ""}`}
      membership={membership}
      now={now}
    />
  );
}
