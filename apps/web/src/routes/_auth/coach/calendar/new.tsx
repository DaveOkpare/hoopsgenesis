import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { CloseIcon } from "@/components/coach/coach-icons";
import {
  circleButtonClass,
  PhoneNavRow,
  PhoneNavTitle,
} from "@/components/coach/phone-nav-row";
import { NewEventForm } from "@/features/events/components/new-event-form";
import { parseAtParam, useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import { useActiveMembership, useViewer } from "@/features/viewer/queries";

const PLAIN_DATE = /^\d{4}-\d{2}-\d{2}$/;

interface NewEventSearch {
  at?: string;
  /** Prefill from the calendar: ?date=2026-11-25&team=team-u14 */
  date?: string;
  team?: string;
}

export const Route = createFileRoute("/_auth/coach/calendar/new")({
  validateSearch: (search: Record<string, unknown>): NewEventSearch => ({
    at: parseAtParam(search.at),
    date:
      typeof search.date === "string" && PLAIN_DATE.test(search.date)
        ? search.date
        : undefined,
    team: typeof search.team === "string" ? search.team : undefined,
  }),
  component: NewEventPage,
});

function NewEventPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const viewer = useViewer();
  const membership = useActiveMembership();
  const now = useSessionClock();
  const handleCreated = useCallback(
    () => navigate({ to: "/coach", search: { at: search.at } }),
    [navigate, search.at]
  );
  if (!membership) {
    return null;
  }
  const today = localDate(now, membership.academy.timezone);
  return (
    <>
      <PhoneNavRow
        center={<PhoneNavTitle>New event</PhoneNavTitle>}
        leading={
          <Link
            aria-label="Close"
            className={circleButtonClass}
            search={{ at: search.at }}
            to="/coach"
          >
            <CloseIcon />
          </Link>
        }
      />
      <PageHeader className="max-md:hidden">
        <PageHeading>
          <Eyebrow>Calendar</Eyebrow>
          <PageTitle>New event</PageTitle>
        </PageHeading>
      </PageHeader>
      <div className="w-full max-w-[560px]">
        <NewEventForm
          academyId={membership.academy.id}
          defaults={{ teamId: search.team, date: search.date ?? today }}
          onCreated={handleCreated}
          teams={membership.teams}
          viewerId={viewer.user.id}
        />
      </div>
    </>
  );
}
