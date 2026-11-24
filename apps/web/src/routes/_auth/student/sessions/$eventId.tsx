import { createFileRoute } from "@tanstack/react-router";

import { useSessionClock } from "@/features/sessions/clock";
import { StudentSessionScreen } from "@/features/sessions/components/student-session-screen";
import { useActiveMembership } from "@/features/viewer/queries";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface StudentSessionSearch {
  /** The session day (as on the coach and admin session routes). */
  date?: string;
}

export const Route = createFileRoute("/_auth/student/sessions/$eventId")({
  validateSearch: (search: Record<string, unknown>): StudentSessionSearch => ({
    date:
      typeof search.date === "string" && PLAIN_DATE.test(search.date)
        ? search.date
        : undefined,
  }),
  component: StudentSessionPage,
});

/** The student's own attendance for one session (ST-4: I69-0, I86-0). */
function StudentSessionPage() {
  const { eventId } = Route.useParams();
  const { date } = Route.useSearch();
  const membership = useActiveMembership();
  const now = useSessionClock();
  if (!membership) {
    return null;
  }
  return (
    <StudentSessionScreen
      date={date}
      eventId={eventId}
      key={`${eventId}:${date ?? ""}`}
      membership={membership}
      now={now}
    />
  );
}
