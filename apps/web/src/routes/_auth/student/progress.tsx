import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
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
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";

import { PlusIcon } from "@/components/student/icons";
import { useAcademyClock } from "@/features/student-calendar/queries";
import { ProgressSwitch } from "@/features/student-progress/progress-switch";
import {
  ChartCard,
  ReportCardList,
  ResultList,
} from "@/features/student-progress/progress-views";
import {
  DRILLS,
  type DrillId,
  drillLabel,
  drillProgress,
} from "@/features/student-progress/selectors";
import { studentRecordsQueryOptions } from "@/features/student-records/queries";
import { useViewer } from "@/features/viewer/queries";

type ProgressTab = DrillId | "report_cards";

const TABS: { id: ProgressTab; label: string }[] = [
  ...DRILLS,
  { id: "report_cards", label: "Report cards" },
];

function isTab(value: unknown): value is ProgressTab {
  return TABS.some((tab) => tab.id === value);
}

interface ProgressSearch {
  show?: ProgressTab;
}

export const Route = createFileRoute("/_auth/student/progress")({
  validateSearch: (search: Record<string, unknown>): ProgressSearch =>
    isTab(search.show) && search.show !== "free_throws"
      ? { show: search.show }
      : {},
  component: ProgressPage,
});

function ProgressPage() {
  const { show = "free_throws" } = Route.useSearch();
  const navigate = useNavigate({ from: "/student/progress" });
  const viewer = useViewer();
  const { academyId, timeZone, today } = useAcademyClock();
  const records = useQuery(
    studentRecordsQueryOptions(academyId, viewer.user.id)
  );

  const selectTab = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { tab } = event.currentTarget.dataset;
      if (isTab(tab)) {
        navigate({
          search: tab === "free_throws" ? {} : { show: tab },
          replace: true,
        });
      }
    },
    [navigate]
  );

  const data = records.data ?? [];
  const isDrill = show !== "report_cards";
  const progress = isDrill ? drillProgress(data, show) : null;
  const reportCards = data.filter((r) => r.recordType === "academic");

  return (
    <div className="flex flex-col gap-8 max-md:gap-5">
      <ProgressSwitch current="results" />
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">Verified results</Eyebrow>
          <PageTitle className="max-md:text-[44px] max-md:leading-[95%]">
            My results
          </PageTitle>
        </PageHeading>
        <PageActions>
          <Link
            className={cn(
              buttonVariants({ size: "sm" }),
              "gap-[6px] px-[14px] py-[9px] md:gap-2 md:px-5 md:py-[13px] md:text-[15px]"
            )}
            to="/student/records/new"
          >
            <PlusIcon />
            Upload
          </Link>
        </PageActions>
      </PageHeader>

      <div
        aria-label="Show"
        className="-mt-2 flex gap-[6px] overflow-x-auto max-md:mt-0"
        role="toolbar"
      >
        {TABS.map((tab) => (
          <FilterChip
            className="px-[14px]"
            data-tab={tab.id}
            key={tab.id}
            onClick={selectTab}
            selected={tab.id === show}
          >
            {tab.label}
          </FilterChip>
        ))}
      </div>

      {records.data ? null : (
        <div className="flex flex-col gap-5 lg:max-w-[640px]">
          <Skeleton className="h-[290px] rounded-lg" />
          <Skeleton className="h-[120px] rounded-md" />
        </div>
      )}
      {records.data && progress ? (
        <div className="grid items-start gap-8 max-md:gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ChartCard
            label={drillLabel(show)}
            progress={progress}
            today={today}
          />
          <ResultList progress={progress} today={today} />
        </div>
      ) : null}
      {records.data && !progress ? (
        <div className="lg:max-w-[640px]">
          <ReportCardList records={reportCards} timeZone={timeZone} />
        </div>
      ) : null}
    </div>
  );
}
