import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

import { BackLink } from "@/components/student/back-link";
import { useAcademyClock } from "@/features/student-calendar/queries";
import {
  drillProgress,
  recordTemplateKey,
  resultSeries,
  seriesResult,
} from "@/features/student-progress/selectors";
import {
  recordQueryOptions,
  recordTemplatesQueryOptions,
  type StudentRecordView,
  studentRecordsQueryOptions,
} from "@/features/student-records/queries";
import {
  ACADEMIC_KIND_LABEL,
  academicData,
} from "@/features/student-records/record-data";
import {
  AcademicRecordDetail,
  AthleticRecordDetail,
} from "@/features/student-records/record-detail";
import { RecordHeader } from "@/features/student-records/record-header";
import { useViewer } from "@/features/viewer/queries";

export const Route = createFileRoute("/_auth/student/records/$recordId")({
  component: RecordPage,
});

function DetailSkeleton() {
  return (
    <div className="flex flex-col gap-5 lg:max-w-[560px]">
      <Skeleton className="h-4 w-40 rounded-full" />
      <Skeleton className="h-[72px] w-48 rounded-md" />
      <Skeleton className="h-7 w-56 rounded-full" />
      <Skeleton className="h-[132px] rounded-md" />
    </div>
  );
}

/** An athletic result: G0D-0, with the other results of the same template. */
function AthleticRecord({
  record,
  timeZone,
}: {
  record: StudentRecordView;
  timeZone: string;
}) {
  const templates = useQuery(
    recordTemplatesQueryOptions(record.academyId, "athletic")
  );
  const results = useQuery(
    studentRecordsQueryOptions(record.academyId, record.studentId, {
      recordType: "athletic",
    })
  );
  if (!(templates.data && results.data)) {
    return <DetailSkeleton />;
  }
  const key = recordTemplateKey(record);
  const series =
    resultSeries(templates.data).find(
      (s) => s.template === key && seriesResult(record, s) !== null
    ) ?? null;
  if (!series) {
    // A template the app doesn't chart (or an old schema): fall back to the plain view.
    return (
      <AcademicRecordDetail
        canDelete={false}
        record={record}
        timeZone={timeZone}
      />
    );
  }
  return (
    <AthleticRecordDetail
      progress={drillProgress(results.data, series)}
      record={record}
      timeZone={timeZone}
    />
  );
}

function RecordPage() {
  const { recordId } = Route.useParams();
  const viewer = useViewer();
  const { academyId, timeZone } = useAcademyClock();
  // A failure throws to the route's error screen (404: "Page not found").
  const record = useQuery(recordQueryOptions(academyId, recordId));
  const athletic = record.data?.recordType === "athletic";
  const canDelete =
    record.data?.status === "pending" &&
    record.data.recordedByPerson?.id === viewer.user.id;

  return (
    <div
      className={
        athletic
          ? "flex w-full flex-1 flex-col gap-5 md:gap-8 lg:max-w-[1040px]"
          : "flex w-full max-w-[560px] flex-1 flex-col gap-5 md:gap-8"
      }
    >
      {athletic ? (
        <BackLink label="My results" to="/student/progress" />
      ) : (
        <RecordHeader
          back={{ to: "/student/progress", search: { show: "report_cards" } }}
          backLabel="My results"
          phoneTitle={
            record.data
              ? ACADEMIC_KIND_LABEL[academicData(record.data).kind]
              : "Record"
          }
          phoneTitleClassName="text-[17px] leading-[22px]"
        />
      )}
      {record.data ? null : <DetailSkeleton />}
      {record.data && athletic ? (
        <AthleticRecord record={record.data} timeZone={timeZone} />
      ) : null}
      {record.data && !athletic ? (
        <AcademicRecordDetail
          canDelete={canDelete}
          record={record.data}
          timeZone={timeZone}
        />
      ) : null}
    </div>
  );
}
