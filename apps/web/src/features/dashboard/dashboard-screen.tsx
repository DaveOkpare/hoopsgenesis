import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import { PlusIcon } from "@/components/icons";
import {
  AttentionCard,
  attentionItems,
  PhoneAttentionList,
} from "@/features/dashboard/attention";
import { calendarDaysBetween, plainDateIn } from "@/features/dashboard/format";
import {
  DesktopMetrics,
  MetricsSkeleton,
  PhoneMetrics,
} from "@/features/dashboard/metrics";
import {
  dashboardQueryOptions,
  todaySessionsQueryOptions,
  useDashboardNow,
} from "@/features/dashboard/queries";
import { TodaySessionsCard } from "@/features/dashboard/today-sessions";
import { UnpaidCard } from "@/features/dashboard/unpaid-table";
import type { Id } from "@/features/types";
import { useViewer } from "@/features/viewer/queries";
import {
  firstName,
  formatLongDate,
  formatShortWeekdayDate,
  formatTime,
  greeting,
} from "@/lib/format";

/** Page header from "[Template] Admin shell" (desktop) and 5TY-0 (phone). */
export function DashboardHeader({
  now,
  timeZone,
}: {
  now: Date;
  timeZone?: string;
}) {
  const viewer = useViewer();
  const name = firstName(viewer.user.name);
  const hello = greeting(now, timeZone);
  return (
    <>
      <MobileAcademyBar />
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            <span className="max-md:hidden">
              {formatLongDate(now, timeZone)}
            </span>
            <span className="md:hidden">
              {formatShortWeekdayDate(now, timeZone)}
            </span>
          </Eyebrow>
          <PageTitle>
            <span className="max-md:hidden">
              {hello}, {name}
            </span>
            <span className="md:hidden">
              {hello.replace("Good ", "")},<br />
              {name}
            </span>
          </PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          <Link
            className={buttonVariants({ variant: "outline" })}
            search={{ invite: 1 }}
            to="/admin/members"
          >
            <PlusIcon />
            Invite people
          </Link>
          <Link
            className={buttonVariants()}
            search={{ record: 1 }}
            to="/admin/fees"
          >
            <PlusIcon />
            Record payment
          </Link>
        </PageActions>
      </PageHeader>
    </>
  );
}

const phoneAction =
  "flex flex-1 basis-0 items-center justify-center gap-2 rounded-full p-[14px] font-semibold text-[15px] leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

function PhoneActions() {
  return (
    <div className="flex gap-[10px] md:hidden">
      <Link
        className={cn(phoneAction, "bg-ink text-white")}
        search={{ record: 1 }}
        to="/admin/fees"
      >
        <PlusIcon />
        Payment
      </Link>
      <Link
        className={cn(phoneAction, "border border-line bg-white text-ink")}
        search={{ invite: 1 }}
        to="/admin/members"
      >
        <PlusIcon />
        Invite
      </Link>
    </div>
  );
}

/** The admin dashboard, story AO-7 (desktop YA-0, phone 5TY-0). */
export function DashboardScreen({
  academyId,
  timeZone,
}: {
  academyId: Id;
  timeZone?: string;
}) {
  const now = useDashboardNow();
  const today = plainDateIn(now, timeZone);
  const summary = useQuery(dashboardQueryOptions(academyId)).data;
  const sessions = useQuery(todaySessionsQueryOptions(academyId, today)).data;
  const oldest = summary?.records.oldest;
  const oldestDays = oldest
    ? calendarDaysBetween(oldest.createdAt, now, timeZone)
    : null;
  const items = summary ? attentionItems(summary, oldestDays, timeZone) : [];

  return (
    <>
      <DashboardHeader now={now} timeZone={timeZone} />
      {summary && sessions ? (
        <>
          <DesktopMetrics
            nowTime={formatTime(now, timeZone)}
            oldestDays={oldestDays}
            sessions={sessions}
            summary={summary}
          />
          <PhoneMetrics
            oldestDays={oldestDays}
            sessions={sessions}
            summary={summary}
          />
        </>
      ) : (
        <MetricsSkeleton />
      )}
      <PhoneActions />
      {summary && sessions ? (
        <>
          <div className="flex items-stretch gap-4 max-md:hidden max-lg:flex-col">
            <AttentionCard items={items} />
            <TodaySessionsCard sessions={sessions} />
          </div>
          <PhoneAttentionList items={items} />
          <UnpaidCard
            academyId={academyId}
            now={now}
            periodStart={summary.outstanding.periodStart}
            timeZone={timeZone}
          />
        </>
      ) : (
        <div className="flex gap-4 max-md:hidden">
          <Skeleton className="h-[358px] flex-[1.25] rounded-[20px]" />
          <Skeleton className="h-[358px] flex-1 rounded-[20px]" />
        </div>
      )}
    </>
  );
}
