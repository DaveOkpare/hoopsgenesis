import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";

import { BackIcon } from "@/components/coach/coach-icons";
import {
  circleButtonClass,
  PhoneNavRow,
  PhoneNavTitle,
} from "@/components/coach/phone-nav-row";
import { LogResultForm } from "@/features/results/components/log-result-form";
import { type DrillId, isDrillId } from "@/features/results/templates";
import { parseAtParam, useSessionClock } from "@/features/sessions/clock";
import { localDate } from "@/features/sessions/time";
import { useActiveMembership } from "@/features/viewer/queries";

interface LogResultSearch {
  at?: string;
  /** Template chip id (see features/results/templates.ts). */
  drill?: DrillId;
  /** Preselected student (from the team page row menu). */
  student?: string;
}

export const Route = createFileRoute("/_auth/coach/results/new")({
  validateSearch: (search: Record<string, unknown>): LogResultSearch => ({
    at: parseAtParam(search.at),
    drill: isDrillId(search.drill) ? search.drill : undefined,
    student: typeof search.student === "string" ? search.student : undefined,
  }),
  component: LogResultPage,
});

function LogResultPage() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const router = useRouter();
  const membership = useActiveMembership();
  const now = useSessionClock();
  const handleStudent = useCallback(
    (student: string) =>
      navigate({ search: (prev) => ({ ...prev, student }), replace: true }),
    [navigate]
  );
  const handleDrill = useCallback(
    (drill: DrillId) =>
      navigate({ search: (prev) => ({ ...prev, drill }), replace: true }),
    [navigate]
  );
  const handleSaved = useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
      return;
    }
    navigate({ to: "/coach", search: { at: search.at } });
  }, [navigate, router, search.at]);
  if (!membership) {
    return null;
  }
  return (
    <>
      <PhoneNavRow
        center={<PhoneNavTitle>Log a result</PhoneNavTitle>}
        leading={
          <Link
            aria-label="Back to Today"
            className={circleButtonClass}
            search={{ at: search.at }}
            to="/coach"
          >
            <BackIcon />
          </Link>
        }
      />
      <PageHeader className="max-md:hidden">
        <PageHeading>
          <Eyebrow>Records</Eyebrow>
          <PageTitle>Log a result</PageTitle>
        </PageHeading>
      </PageHeader>
      <LogResultForm
        academyId={membership.academy.id}
        drill={search.drill}
        onDrillChange={handleDrill}
        onSaved={handleSaved}
        onStudentChange={handleStudent}
        studentId={search.student}
        teams={membership.teams}
        today={localDate(now, membership.academy.timezone)}
      />
    </>
  );
}
