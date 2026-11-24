import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { BackLink } from "@/components/student/back-link";
import { useAcademyClock } from "@/features/student-calendar/queries";
import { FeeDetail, type FeeSubject } from "@/features/student-fees/fee-detail";
import {
  ESTIMATED_DUE_ID,
  myFeeQueryOptions,
  myFeesQueryOptions,
} from "@/features/student-fees/queries";

export const Route = createFileRoute("/_auth/student/fees/$feeId")({
  component: FeeDetailPage,
});

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:max-w-[560px]">
      <div className="flex flex-col gap-[10px]">
        <Skeleton className="h-4 w-48 rounded-full" />
        <Skeleton className="h-14 w-56 rounded-md" />
        <Skeleton className="h-7 w-44 rounded-full" />
      </div>
      <Skeleton className="h-[136px] rounded-[20px]" />
    </div>
  );
}

/** /student/fees/due when there is no estimate (paid since, billed, or no history). */
function NothingDue() {
  return (
    <section className="flex flex-col items-start gap-4 rounded-lg bg-fog p-5 md:max-w-[560px] md:p-7">
      <div className="flex flex-col gap-2">
        <h1 className="font-semibold text-ink text-lg leading-6">
          Nothing to show here
        </h1>
        <p className="text-ink-soft text-sm leading-5">
          There’s no estimated fee for you right now. Your fees page shows what
          you’ve paid and where you stand.
        </p>
      </div>
      <Link className={buttonVariants({ size: "sm" })} to="/student/fees">
        Go to fees
      </Link>
    </section>
  );
}

function FeeDetailPage() {
  const { feeId } = Route.useParams();
  const { academyId, timeZone, today } = useAcademyClock();
  const isEstimate = feeId === ESTIMATED_DUE_ID;
  // The payments list feeds "Past payments"; the estimate's page is built from it.
  const fees = useQuery({
    ...myFeesQueryOptions(academyId),
    throwOnError: isEstimate,
  });
  // A failure (404 included) throws to the route's error screen.
  const fee = useQuery({
    ...myFeeQueryOptions(academyId, feeId),
    enabled: !isEstimate,
  });

  let subject: FeeSubject | null = null;
  if (isEstimate && fees.data?.due) {
    subject = { kind: "estimate", due: fees.data.due };
  } else if (!isEstimate && fee.data) {
    subject = { kind: "fee", fee: fee.data };
  }
  const nothingDue = isEstimate && fees.data && !fees.data.due;

  return (
    <div className="flex flex-col gap-5 md:gap-8 lg:max-w-[1040px]">
      <BackLink label="Fees" to="/student/fees" />
      {subject ? (
        <FeeDetail
          payments={fees.data?.data}
          subject={subject}
          timeZone={timeZone}
          today={today}
        />
      ) : null}
      {nothingDue ? <NothingDue /> : null}
      {subject || nothingDue ? null : <DetailSkeleton />}
    </div>
  );
}
