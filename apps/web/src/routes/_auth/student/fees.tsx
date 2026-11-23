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
  PaidUpCard,
  PaymentHistory,
} from "@/features/student-fees/fee-views";
import { myFeesQueryOptions } from "@/features/student-fees/queries";
import { useActiveMembership } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/student/fees")({
  component: FeesPage,
});

function FeesPage() {
  const { academyId, timeZone, today } = useAcademyClock();
  const academyName = useActiveMembership()?.academy.name;
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
        <div className="grid items-start gap-8 max-md:gap-5 lg:grid-cols-[440px_minmax(0,1fr)]">
          {fees.data.due ? (
            <FeeDueCard
              due={fees.data.due}
              onlinePayment={fees.data.onlinePayment}
              today={today}
            />
          ) : (
            <PaidUpCard paidUpTo={fees.data.paidThrough} />
          )}
          <PaymentHistory fees={fees.data.data} timeZone={timeZone} />
        </div>
      ) : (
        <div className="grid items-start gap-8 max-md:gap-5 lg:grid-cols-[440px_minmax(0,1fr)]">
          <Skeleton className="h-[290px] rounded-lg" />
          <Skeleton className="h-[160px] rounded-md" />
        </div>
      )}
    </div>
  );
}
