import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";
import { toast } from "sonner";

import { ChevronIcon, RecordIcon } from "@/components/coach/coach-icons";
import {
  type RecordToReview,
  useVerifyRecord,
} from "@/features/coach-today/queries";
import type { Id } from "@/features/types";

const PANEL_ROWS = 3;

/** Desktop: "Records waiting for you" (4QT-0). Athletic results verify in one tap. */
export function RecordsCard({
  records,
  loading,
  academyId,
  viewerId,
}: {
  records: RecordToReview[];
  loading: boolean;
  academyId: Id;
  viewerId: Id;
}) {
  const verify = useVerifyRecord(academyId);
  const { mutate } = verify;
  const handleVerify = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      const { recordId, studentName } = event.currentTarget.dataset;
      if (!recordId) {
        return;
      }
      mutate(
        { recordId, verifiedBy: viewerId },
        {
          onSuccess: () =>
            toast.success(`Verified ${studentName ?? ""}`.trim()),
          onError: (error) => toast.error(error.message),
        }
      );
    },
    [mutate, viewerId]
  );
  const shown = records.slice(0, PANEL_ROWS);
  return (
    <section className="flex min-w-0 grow basis-0 flex-col gap-1 rounded-lg bg-fog p-6">
      <div className="flex items-center justify-between pb-3">
        <h2 className="font-semibold text-ink text-lg leading-6">
          Records waiting for you
        </h2>
        {records.length > 0 ? (
          <span className="rounded-full bg-orange px-[9px] py-[2px] font-semibold text-[13px] text-ink leading-[18px]">
            {records.length}
          </span>
        ) : null}
      </div>
      {loading ? (
        <div className="flex flex-col gap-3 border-line border-t pt-4">
          <Skeleton className="h-10 bg-white" />
          <Skeleton className="h-10 bg-white" />
        </div>
      ) : null}
      {!loading && records.length === 0 ? (
        <p className="border-line border-t pt-4 text-[15px] text-muted leading-5">
          Nothing waiting for review.
        </p>
      ) : null}
      <ul className="flex flex-col">
        {shown.map((record) => (
          <li
            className="flex items-center gap-3 border-line border-t py-[14px] last:pb-0"
            key={record.id}
          >
            <span className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold text-[15px] text-ink leading-5">
                {record.studentName}
              </span>
              <span className="text-[13px] text-muted leading-4">
                {[record.summary, record.teamName].filter(Boolean).join(" · ")}
              </span>
            </span>
            {record.recordType === "athletic" ? (
              <Button
                className="px-[14px] py-2"
                data-record-id={record.id}
                data-student-name={record.studentName}
                disabled={verify.isPending}
                onClick={handleVerify}
                size="sm"
              >
                Verify
              </Button>
            ) : (
              <Link
                className={cn(
                  buttonVariants({ variant: "outline", size: "sm" }),
                  "px-[14px] py-2"
                )}
                to="/coach/records"
              >
                Review
              </Link>
            )}
          </li>
        ))}
      </ul>
      {records.length > PANEL_ROWS ? (
        <Link
          className="mt-3 w-fit rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
          to="/coach/records"
        >
          See all {records.length}
        </Link>
      ) : null}
    </section>
  );
}

/** Phone: "3 records waiting for your review" nudge (3MZ-0). */
export function RecordsNudge({ count }: { count: number }) {
  if (count === 0) {
    return null;
  }
  return (
    <Link
      className="flex items-center gap-3 rounded-md bg-fog px-4 py-[14px] text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink md:hidden"
      to="/coach/records"
    >
      <RecordIcon className="shrink-0" />
      <span className="flex-1 text-[15px] leading-[18px]">
        <span className="font-semibold">
          {count} {count === 1 ? "record" : "records"}
        </span>{" "}
        waiting for your review
      </span>
      <ChevronIcon className="shrink-0" />
    </Link>
  );
}
