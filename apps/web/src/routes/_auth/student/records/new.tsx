import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { WarningIcon } from "@/components/student/icons";
import { useAcademyClock } from "@/features/student-calendar/queries";
import { recordQueryOptions } from "@/features/student-records/queries";
import {
  academicData,
  academicTitle,
  personLabel,
} from "@/features/student-records/record-data";
import { RecordHeader } from "@/features/student-records/record-header";
import { UploadForm } from "@/features/student-records/upload-form";
import { useViewer } from "@/features/viewer/queries";

interface NewRecordSearch {
  /** The rejected record this upload replaces ("Upload again" on 5DZ-0). */
  replaces?: string;
}

export const Route = createFileRoute("/_auth/student/records/new")({
  validateSearch: (search: Record<string, unknown>): NewRecordSearch =>
    typeof search.replaces === "string" && search.replaces
      ? { replaces: search.replaces }
      : {},
  component: NewRecordPage,
});

function NewRecordPage() {
  const { replaces } = Route.useSearch();
  const viewer = useViewer();
  const { academyId, today } = useAcademyClock();
  const replaced = useQuery({
    ...recordQueryOptions(academyId, replaces ?? ""),
    enabled: Boolean(replaces),
  });
  const rejected =
    replaced.data?.status === "rejected" ? replaced.data : undefined;
  const rejectedData = rejected ? academicData(rejected) : null;
  const waiting = Boolean(replaces) && replaced.status === "pending";

  return (
    <div className="flex w-full max-w-[560px] flex-col gap-5 md:gap-8">
      <RecordHeader
        back={
          replaces
            ? {
                to: "/student/records/$recordId",
                params: { recordId: replaces },
              }
            : { to: "/student/progress", search: { show: "report_cards" } }
        }
        backLabel={replaces ? "Back to the record" : "My results"}
        eyebrow="Academic records"
        phoneTitle="Upload a record"
        title="Upload a record"
      />

      {rejected && rejectedData ? (
        <div className="flex gap-3 rounded-md bg-orange-soft p-[14px]">
          <WarningIcon className="shrink-0 text-orange-deep" />
          <div className="flex flex-col gap-[2px]">
            <p className="font-semibold text-ink text-sm leading-[18px]">
              {academicTitle(rejectedData)} was rejected
            </p>
            {rejected.reviewNote ? (
              <p className="text-ink-soft text-sm leading-[140%]">
                {rejected.reviewedBy
                  ? `${personLabel(rejected.reviewedBy)}: `
                  : ""}
                “{rejected.reviewNote}”
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {waiting ? (
        <Skeleton className="h-[420px] rounded-md" />
      ) : (
        <UploadForm
          academyId={academyId}
          initial={
            rejectedData
              ? {
                  kind: rejectedData.kind,
                  school: rejectedData.school ?? "",
                }
              : undefined
          }
          key={rejected?.id ?? "new"}
          studentId={viewer.user.id}
          today={today}
        />
      )}
    </div>
  );
}
