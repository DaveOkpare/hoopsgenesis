import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import { QueryBoundary } from "@/components/error-state";
import { PlusIcon } from "@/components/icons";
import { TeamMonthCard } from "@/features/coach-today/components/team-month-card";
import {
  RecordsCard,
  RecordsNudge,
} from "@/features/coach-today/components/today-records";
import {
  LiveSessionCard,
  nextToOpen,
  PhoneSessionList,
  SessionsCard,
} from "@/features/coach-today/components/today-sessions";
import { recordsToReviewQueryOptions } from "@/features/coach-today/queries";
import { asOfKey, sessionsOnQueryOptions } from "@/features/sessions/queries";
import { localDate } from "@/features/sessions/time";
import type { Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";
import {
  firstName,
  formatLongDate,
  formatShortWeekdayDate,
  greeting,
} from "@/lib/format";

/** Coach home (CO-1): 4QT-0 on the web, 3MZ-0 on phones. */
export function TodayScreen({
  membership,
  viewerId,
  viewerName,
  now,
  at,
  teamId,
  onTeamChange,
}: {
  membership: Membership;
  viewerId: Id;
  viewerName: string;
  now: Date;
  /** Preview clock, passed on to session links. */
  at?: string;
  teamId?: Id;
  onTeamChange: (teamId: Id) => void;
}) {
  const academyId = membership.academy.id;
  const timeZone = membership.academy.timezone;
  const today = localDate(now, timeZone);
  const teamIds = membership.teams.map((t) => t.id);
  const sessionsQuery = useQuery(
    sessionsOnQueryOptions(membership.academy, today, teamIds, asOfKey(now))
  );
  // Only the phone nudge's count here (left out if it fails); the desktop card loads
  // the same query inside its own error boundary.
  const recordsQuery = useQuery({
    ...recordsToReviewQueryOptions(academyId, membership.teams),
    throwOnError: false,
  });
  const sessionsLoading = sessionsQuery.data === undefined;
  const sessions = sessionsQuery.data ?? [];
  const records = recordsQuery.data ?? [];

  const live = sessions.filter((s) => s.status === "open");
  const later = sessions.filter((s) => s.status === "upcoming");
  const earlier = sessions.filter(
    (s) => s.status === "closed" || s.status === "cancelled"
  );
  const next = nextToOpen(sessions);
  const tableTeam =
    teamId && teamIds.includes(teamId)
      ? teamId
      : (next?.team?.id ?? teamIds[0]);

  return (
    <>
      <MobileAcademyBar />
      <PageHeader>
        <PageHeading className="max-md:gap-[2px]">
          <Eyebrow>
            <span className="max-md:hidden">
              {formatLongDate(now, timeZone)}
            </span>
            <span className="md:hidden">
              {formatShortWeekdayDate(now, timeZone)}
            </span>
          </Eyebrow>
          <PageTitle className="max-md:text-display-sm max-md:leading-[95%]">
            <span className="max-md:hidden">
              {greeting(now, timeZone)}, {firstName(viewerName)}
            </span>
            <span className="md:hidden">Today</span>
          </PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          <Link
            className={buttonVariants({
              size: "lg",
              className: "px-[22px] py-3 text-[15px]",
            })}
            search={{ at }}
            to="/coach/calendar/new"
          >
            <PlusIcon />
            New event
          </Link>
        </PageActions>
      </PageHeader>

      {/* Phone (3MZ-0) */}
      {sessionsLoading ? (
        <Skeleton className="h-60 rounded-lg md:hidden" />
      ) : null}
      {live.map((session) => (
        <LiveSessionCard
          at={at}
          key={session.event.id}
          session={session}
          viewerId={viewerId}
        />
      ))}
      <PhoneSessionList
        at={at}
        label="Later today"
        next={next}
        sessions={later}
        viewerId={viewerId}
      />
      <PhoneSessionList
        at={at}
        label="Earlier today"
        next={next}
        sessions={earlier}
        viewerId={viewerId}
      />
      {!sessionsLoading && sessions.length === 0 ? (
        <p className="text-[15px] text-muted leading-5 md:hidden">
          No sessions today.
        </p>
      ) : null}
      <RecordsNudge count={records.length} />

      {/* Web (4QT-0) */}
      <div className="flex items-start gap-5 max-md:hidden max-lg:flex-col max-lg:items-stretch">
        <SessionsCard
          at={at}
          loading={sessionsLoading}
          sessions={sessions}
          viewerId={viewerId}
        />
        <QueryBoundary className="min-w-0 grow basis-0" what="records">
          <RecordsCard academyId={academyId} teams={membership.teams} />
        </QueryBoundary>
      </div>
      {tableTeam ? (
        <QueryBoundary className="max-md:hidden" what="the team’s month">
          <TeamMonthCard
            academyId={academyId}
            onTeamChange={onTeamChange}
            teamId={tableTeam}
            teams={membership.teams}
            today={today}
          />
        </QueryBoundary>
      ) : null}
    </>
  );
}
