import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";

import { DocumentIcon, UploadIcon } from "@/components/student/icons";
import { dayMonth, toDateOnly } from "@/features/student-calendar/dates";
import { useAcademyClock } from "@/features/student-calendar/queries";
import { StatusPill } from "@/features/student-progress/progress-views";
import {
  recordQueryOptions,
  type StudentRecordView,
} from "@/features/student-records/queries";
import {
  ACADEMIC_KIND_LABEL,
  type AcademicData,
  academicData,
  academicTitle,
  personLabel,
} from "@/features/student-records/record-data";
import { RecordHeader } from "@/features/student-records/record-header";
import {
  fileKindLabel,
  formatFileSize,
} from "@/features/student-records/upload-rules";

export const Route = createFileRoute("/_auth/student/records/$recordId")({
  component: RecordPage,
});

const BACK = {
  to: "/student/progress",
  search: { show: "report_cards" },
} as const;

function metaLine(record: StudentRecordView, timeZone: string): string {
  const uploaded = `Uploaded ${dayMonth(toDateOnly(record.createdAt, timeZone))}`;
  if (record.status === "pending") {
    return `${uploaded} · waiting for your coach to review it`;
  }
  const by = record.reviewedBy ? ` by ${personLabel(record.reviewedBy)}` : "";
  if (!record.reviewedAt) {
    // The server records who reviewed it, not when.
    return by ? `${uploaded} · reviewed${by}` : uploaded;
  }
  return `${uploaded} · reviewed ${dayMonth(toDateOnly(record.reviewedAt, timeZone))}${by}`;
}

function detailRows(data: AcademicData): { label: string; value: string }[] {
  const rows: { label: string; value: string | null }[] =
    data.kind === "report_card"
      ? [
          { label: "School", value: data.school },
          { label: "Term", value: data.term },
          { label: "School year", value: data.schoolYear },
          { label: "Subjects", value: data.subjects },
          {
            label: "Average",
            value:
              data.averagePercent === null ? null : `${data.averagePercent}%`,
          },
          {
            label: "Position in class",
            value:
              data.position && data.classSize
                ? `${data.position} of ${data.classSize}`
                : null,
          },
          { label: "Notes", value: data.notes },
        ]
      : [
          { label: "Title", value: data.title },
          { label: "Issued by", value: data.issuedBy },
          { label: "Note", value: data.note },
        ];
  return rows.flatMap((row) =>
    row.value ? [{ label: row.label, value: row.value }] : []
  );
}

function RecordDetail({
  record,
  timeZone,
}: {
  record: StudentRecordView;
  timeZone: string;
}) {
  const data = academicData(record);
  const rejected = record.status === "rejected";
  const rows = rejected ? [] : detailRows(data);
  const fileMeta = [
    data.contentType ? fileKindLabel(data.contentType) : null,
    data.fileSize ? formatFileSize(data.fileSize) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 md:justify-start">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-[10px]">
          {rejected ? (
            <span className="self-start rounded-full bg-orange-deep px-3 py-1 font-semibold text-[13px] text-white leading-4">
              Rejected
            </span>
          ) : (
            <span className="self-start">
              <StatusPill status={record.status} />
            </span>
          )}
          <h1 className="font-display text-[48px] text-ink uppercase leading-[46px] md:text-display-sm md:leading-[95%]">
            {academicTitle(data)}
          </h1>
          <p className="text-muted text-sm leading-[18px]">
            {metaLine(record, timeZone)}
          </p>
        </div>

        {rejected && record.reviewNote ? (
          <section
            aria-labelledby="coach-note"
            className="flex flex-col gap-2 rounded-[20px] bg-orange-soft p-4"
          >
            <h2
              className="font-medium text-[12px] text-orange-deep uppercase leading-4 tracking-label"
              id="coach-note"
            >
              Note from your coach
            </h2>
            <p className="text-base text-ink leading-[23px]">
              “{record.reviewNote}”
            </p>
          </section>
        ) : null}

        <div className="flex items-center gap-[14px] rounded-[20px] border border-line p-[14px]">
          <span className="flex h-16 w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-fog text-muted">
            <DocumentIcon />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <span className="truncate font-semibold text-[15px] text-ink leading-5">
              {data.fileName ?? ACADEMIC_KIND_LABEL[data.kind]}
            </span>
            {fileMeta ? (
              <span className="text-[13px] text-muted leading-4">
                {fileMeta}
              </span>
            ) : null}
            {record.fileUrl ? (
              <a
                className="self-start rounded-sm font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
                href={record.fileUrl}
                rel="noopener"
                target="_blank"
              >
                Open file
              </a>
            ) : null}
            {record.hasFile || data.fileName ? null : (
              <span className="text-[13px] text-muted leading-4">
                No file attached
              </span>
            )}
          </span>
        </div>

        {rows.length > 0 ? (
          <dl className="flex flex-col rounded-md bg-fog px-4">
            {rows.map((row) => (
              <div
                className="flex justify-between gap-4 border-line border-b py-[14px] last:border-b-0"
                key={row.label}
              >
                <dt className="text-[15px] text-muted leading-[18px]">
                  {row.label}
                </dt>
                <dd className="text-right font-medium text-[15px] text-ink leading-[18px]">
                  {row.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>

      {rejected ? (
        <div className="flex flex-col gap-3">
          <Link
            className={cn(
              buttonVariants(),
              "w-full gap-[10px] p-[18px] text-[17px] leading-[22px] [&_svg:not([class*='size-'])]:size-[18px]"
            )}
            search={{ replaces: record.id }}
            to="/student/records/new"
          >
            <UploadIcon />
            Upload again
          </Link>
          <p className="text-center text-muted text-sm leading-[18px]">
            The rejected upload stays in your history.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function RecordPage() {
  const { recordId } = Route.useParams();
  const { academyId, timeZone } = useAcademyClock();
  // A failure throws to the route's error screen (404: "Page not found").
  const record = useQuery(recordQueryOptions(academyId, recordId));
  const kindLabel = record.data
    ? ACADEMIC_KIND_LABEL[academicData(record.data).kind]
    : "Record";

  return (
    <div className="flex w-full max-w-[560px] flex-1 flex-col gap-5 md:gap-8">
      <RecordHeader
        back={BACK}
        backLabel="My results"
        phoneTitle={kindLabel}
        phoneTitleClassName="text-[17px] leading-[22px]"
      />
      {record.status === "pending" ? (
        <div className="flex flex-col gap-5">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-[92px] rounded-md" />
          <Skeleton className="h-[92px] rounded-[20px]" />
        </div>
      ) : null}
      {record.data ? (
        <RecordDetail record={record.data} timeZone={timeZone} />
      ) : null}
    </div>
  );
}
