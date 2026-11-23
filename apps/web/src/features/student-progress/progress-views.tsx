import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { ChevronRightIcon } from "@/components/student/icons";
import { dayMonth, toDateOnly } from "@/features/student-calendar/dates";
import { ResultChart } from "@/features/student-progress/result-chart";
import type { DrillProgress } from "@/features/student-progress/selectors";
import type { StudentRecordView } from "@/features/student-records/queries";
import {
  academicData,
  academicTitle,
  personLabel,
} from "@/features/student-records/record-data";
import type { DateOnly, RecordStatus } from "@/features/types";

/* Pieces of "[Student] My progress" (47V-0). */

const STATUS_PILL: Record<RecordStatus, { label: string; className: string }> =
  {
    pending: {
      label: "Waiting for review",
      className: "border border-[#C8C8C8] border-dashed text-muted",
    },
    verified: { label: "Verified", className: "bg-[#E3F5EA] text-success" },
    rejected: { label: "Rejected", className: "bg-orange-deep text-white" },
  };

export function StatusPill({ status }: { status: RecordStatus }) {
  const pill = STATUS_PILL[status];
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-[10px] py-1 font-semibold text-[12px] leading-4",
        pill.className
      )}
    >
      {pill.label}
    </span>
  );
}

export function ChartCard({
  label,
  progress,
  today,
}: {
  label: string;
  progress: DrillProgress;
  today: DateOnly;
}) {
  return (
    <section
      aria-label={`${label}: best verified result`}
      className="flex flex-col gap-[14px] rounded-lg bg-fog p-[18px] md:gap-5 md:p-6"
    >
      <div className="flex items-end justify-between gap-3">
        <div className="flex flex-col">
          <h2 className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
            Best · verified
          </h2>
          <p className="flex items-baseline gap-1">
            <span className="font-display text-[52px] text-ink leading-[95%]">
              {progress.best?.result.made ?? "—"}
            </span>
            <span className="font-semibold text-base text-muted leading-5">
              of {progress.attempts}
            </span>
          </p>
        </div>
        {progress.gain && progress.gain.amount > 0 ? (
          <p className="font-semibold text-sm text-success leading-[18px]">
            <span aria-hidden="true">▲ </span>
            <span className="sr-only">Up </span>
            {progress.gain.amount} since {progress.gain.since}
          </p>
        ) : null}
      </div>
      {progress.points.length > 0 ? (
        <>
          <ResultChart
            className="md:hidden"
            label={label}
            progress={progress}
            today={today}
            width={310}
          />
          <ResultChart
            className="max-md:hidden"
            height={200}
            label={label}
            progress={progress}
            today={today}
            width={620}
          />
        </>
      ) : (
        <p className="text-muted text-sm leading-5">
          No results yet. Your coach logs them at training.
        </p>
      )}
    </section>
  );
}

export function ResultList({
  progress,
  today,
}: {
  progress: DrillProgress;
  today: DateOnly;
}) {
  const points = [...progress.points].reverse();
  if (points.length === 0) {
    return null;
  }
  return (
    <ul aria-label="Results" className="flex flex-col">
      {points.map(({ record, result }) => {
        const when =
          record.recordedOn === today ? "Today" : dayMonth(record.recordedOn);
        let who = "";
        if (record.status === "verified" && record.reviewedBy) {
          who = `verified by ${personLabel(record.reviewedBy)}`;
        } else if (record.recordedByPerson) {
          who = `logged by ${personLabel(record.recordedByPerson)}`;
        }
        return (
          <li
            className="flex items-center justify-between gap-3 border-line border-b py-3 last:border-b-0"
            key={record.id}
          >
            <div className="flex min-w-0 flex-col">
              <p className="font-semibold text-[15px] text-ink leading-[18px]">
                {result.made} of {result.attempts}
                {progress.best?.record.id === record.id ? (
                  <span className="text-orange-deep">
                    {" "}
                    <span aria-hidden="true">★</span> Best
                  </span>
                ) : null}
              </p>
              <p className="text-[13px] text-muted leading-4">
                {[when, who].filter(Boolean).join(" · ")}
              </p>
            </div>
            <StatusPill status={record.status} />
          </li>
        );
      })}
    </ul>
  );
}

export function ReportCardList({
  records,
  timeZone,
}: {
  records: StudentRecordView[];
  timeZone: string;
}) {
  if (records.length === 0) {
    return (
      <div className="flex flex-col gap-2 rounded-lg bg-fog p-6">
        <p className="font-semibold text-ink text-lg leading-6">
          No report cards yet
        </p>
        <p className="text-muted text-sm leading-5">
          Upload a PDF or photo and your coach reviews it.
        </p>
      </div>
    );
  }
  return (
    <ul aria-label="Report cards" className="flex flex-col">
      {records.map((record) => {
        const data = academicData(record);
        return (
          <li className="border-line border-b last:border-b-0" key={record.id}>
            <Link
              className="flex items-center gap-3 py-3 outline-none hover:bg-fog/60 focus-visible:bg-fog"
              params={{ recordId: record.id }}
              to="/student/records/$recordId"
            >
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {academicTitle(data)}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  Uploaded {dayMonth(toDateOnly(record.createdAt, timeZone))}
                  {data.school ? ` · ${data.school}` : ""}
                </span>
              </span>
              <StatusPill status={record.status} />
              <ChevronRightIcon className="shrink-0 text-muted" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
