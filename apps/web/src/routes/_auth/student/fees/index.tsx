import {
  Eyebrow,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { useAcademyClock } from "@/features/student-calendar/queries";
import {
  FeeDueCard,
  NoFeeRecordCard,
  PaidUpCard,
  PaymentHistory,
} from "@/features/student-fees/fee-views";
import {
  type MyFees,
  myFeesQueryOptions,
} from "@/features/student-fees/queries";
import type { DateOnly } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/student/fees/")({
  component: FeesPage,
});

const GRID =
  "grid items-start gap-8 max-md:gap-5 lg:grid-cols-[440px_minmax(0,1fr)]";

function StandingCard({ fees, today }: { fees: MyFees; today: DateOnly }) {
  if (fees.due) {
    return (
      <FeeDueCard
        due={fees.due}
        onlinePayment={fees.onlinePayment}
        today={today}
      />
    );
  }
  if (fees.standing === "unknown") {
    return <NoFeeRecordCard />;
  }
  return <PaidUpCard paidUpTo={fees.paidThrough} />;
}

function FeesPage() {
  const { academyId, timeZone, today } = useAcademyClock();
  const academyName = useActiveMembership()?.academy.name;
  // A failure with nothing to show throws to the route's error screen.
  const fees = useQuery(myFeesQueryOptions(academyId));

  return (
    <div className="flex flex-col gap-8 max-md:gap-5 lg:max-w-[1040px]">
      <PageHeader>
        <PageHeading>
          <Eyebrow className="max-md:hidden">{academyName}</Eyebrow>
          <PageTitle className="max-md:text-[44px] max-md:leading-[95%]">
            Fees
          </PageTitle>
        </PageHeading>
      </PageHeader>

      {fees.data ? (
        <div className={GRID}>
          <StandingCard fees={fees.data} today={today} />
          <PaymentHistory fees={fees.data.data} timeZone={timeZone} />
        </div>
      ) : (
        <div className={GRID}>
          <Skeleton className="h-[290px] rounded-lg" />
          <div className="flex flex-col gap-3">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-[68px] rounded-md" />
            <Skeleton className="h-[68px] rounded-md" />
          </div>
        </div>
      )}
    </div>
  );
}
