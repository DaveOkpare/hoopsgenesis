import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { CloseIcon } from "@/components/coach/coach-icons";
import {
  circleButtonClass,
  PhoneNavRow,
  PhoneNavTitle,
} from "@/components/coach/phone-nav-row";
import { isDateOnly, toDateOnly } from "@/features/calendar/dates";
import { calendarTeamsQueryOptions } from "@/features/calendar/queries";
import { NewEventForm } from "@/features/events/components/new-event-form";
import { useActiveMembership } from "@/features/viewer/queries";
import { appNow } from "@/lib/preview";

interface NewEventSearch {
  /** Prefill from the calendar: ?date=2026-11-25&team=<teamId> */
  date?: string;
  team?: string;
}

/*
 * The admin's "New event" (from the calendar, 8BX-0). Same form as the coach's
 * (features/events), offered every team of the academy.
 */
export const Route = createFileRoute("/_auth/admin/calendar/new")({
  validateSearch: (search: Record<string, unknown>): NewEventSearch => ({
    date: isDateOnly(search.date) ? search.date : undefined,
    team: typeof search.team === "string" ? search.team : undefined,
  }),
  component: NewEventPage,
});

function NewEventPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const membership = useActiveMembership();
  const academyId = membership?.academy.id ?? "";
  const teams = useQuery(calendarTeamsQueryOptions(academyId)).data;
  const handleCreated = useCallback(
    (firstDate: string) =>
      navigate({ to: "/admin/calendar", search: { day: firstDate } }),
    [navigate]
  );
  if (!membership) {
    return null;
  }
  const today = toDateOnly(appNow(), membership.academy.timezone);
  return (
    <>
      <PhoneNavRow
        center={<PhoneNavTitle>New event</PhoneNavTitle>}
        leading={
          <Link
            aria-label="Close"
            className={circleButtonClass}
            to="/admin/calendar"
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
        {teams ? (
          <NewEventForm
            academyId={academyId}
            defaults={{
              teamId: search.team,
              date: search.date ?? today,
              today,
            }}
            onCreated={handleCreated}
            teams={teams}
          />
        ) : (
          <Skeleton className="h-[520px] w-full rounded-[20px]" />
        )}
      </div>
    </>
  );
}
