import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";
import { toast } from "sonner";

import { useIsOffline } from "@/components/offline";

import {
  CheckIcon,
  DocumentIcon,
  UploadIcon,
} from "@/components/student/icons";
import {
  dayMonth,
  monthName,
  monthOf,
  toDateOnly,
  weekdayShort,
} from "@/features/student-calendar/dates";
import {
  type DrillProgress,
  formatResult,
  formatValue,
  type ResultPoint,
  type ResultSeries,
  seriesResult,
} from "@/features/student-progress/selectors";
import {
  type StudentRecordView,
  useDeleteRecord,
} from "@/features/student-records/queries";
import {
  ACADEMIC_KIND_LABEL,
  type AcademicData,
  academicData,
  academicTitle,
  personLabel,
} from "@/features/student-records/record-data";
import {
  fileKindLabel,
  formatFileSize,
} from "@/features/student-records/upload-rules";
import type { Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";

/*
 * The record page (ST-6, ST-7). Athletic results follow "Record detail, verified"
 * (G0D-0): the result, a status pill, details, earlier results. Academic records follow
 * "Record rejected" (5DZ-0): status, title, the coach's note, the file, the values.
 * Pending and verified states use the same pieces: a dashed pill while waiting, green
 * once verified. The file opens through the signed URL from GET /records/:id.
 */

const PILL =
  "flex items-center gap-[6px] self-start rounded-full px-3 py-[6px] font-semibold text-[13px] leading-4";

/** "Sat 14 Nov" */
function shortDate(date: string): string {
  return `${weekdayShort(date)} ${dayMonth(date)}`;
}

function reviewedOn(record: StudentRecordView, timeZone: string): string {
  return record.reviewedAt
    ? ` on ${dayMonth(toDateOnly(record.reviewedAt, timeZone))}`
    : "";
}

/** Verified / waiting / rejected, in the language of G0D-0. */
export function RecordStatusPill({
  record,
  timeZone,
}: {
  record: StudentRecordView;
  timeZone: string;
}) {
  const by = record.reviewedBy ? ` by ${personLabel(record.reviewedBy)}` : "";
  if (record.status === "verified") {
    return (
      <p className={cn(PILL, "bg-[#E3F4EA] text-success")}>
        <CheckIcon height={14} width={14} />
        Verified{by}
        {reviewedOn(record, timeZone)}
      </p>
    );
  }
  if (record.status === "rejected") {
    return (
      <p className={cn(PILL, "bg-orange-deep text-white")}>
        Rejected{by}
        {reviewedOn(record, timeZone)}
      </p>
    );
  }
  return (
    <p
      className={cn(
        PILL,
        "border-[#C8C8C8] border-[1.5px] border-dashed py-[5px] text-muted"
      )}
    >
      Waiting for your coach to review it
    </p>
  );
}

function DetailRows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <dl className="flex flex-col">
      {rows.map((row) => (
        <div
          className="flex justify-between gap-4 border-line border-b py-3 last:border-b-0"
          key={row.label}
        >
          <dt className="shrink-0 text-[15px] text-muted leading-5">
            {row.label}
          </dt>
          <dd className="text-right font-medium text-[15px] text-ink leading-5">
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function FileRow({ record }: { record: StudentRecordView }) {
  return (
    <div className="flex justify-between gap-4 py-3">
      <span className="text-[15px] text-muted leading-5">File</span>
      {record.fileUrl ? (
        <a
          className="rounded-sm font-semibold text-[15px] text-ink leading-5 underline decoration-1 underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
          href={record.fileUrl}
          rel="noopener"
          target="_blank"
        >
          Open file
        </a>
      ) : (
        <span className="font-medium text-[15px] text-muted leading-5">
          {record.hasFile ? "Can’t be opened right now" : "None, typed in"}
        </span>
      )}
    </div>
  );
}

function ReviewNote({ note }: { note: string }) {
  return (
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
      <p className="text-base text-ink leading-[23px]">“{note}”</p>
    </section>
  );
}

const FOOTNOTE: Record<StudentRecordView["status"], string> = {
  verified:
    "Verified results are final. Ask your coach if something looks wrong.",
  pending: "It counts toward your best once your coach verifies it.",
  rejected: "Rejected results don’t count toward your best.",
};

/** The earlier result's month ("October"), or its day when in the same month ("6 Nov"). */
function whenLabel(previous: ResultPoint, point: ResultPoint): string {
  const date = previous.record.recordedOn;
  return monthOf(date) === monthOf(point.record.recordedOn)
    ? dayMonth(date)
    : monthName(monthOf(date));
}

/** "▲ 1 more than October", "▲ 0.3 s faster than October" */
function changeLabel(
  point: ResultPoint,
  previous: ResultPoint,
  series: ResultSeries
): { text: string; better: boolean } | null {
  const diff = point.result.value - previous.result.value;
  if (diff === 0) {
    return {
      text: `Same as ${whenLabel(previous, point)}`,
      better: false,
    };
  }
  const lowerIsBetter = series.better === "lower";
  const better = lowerIsBetter ? diff < 0 : diff > 0;
  const amount = [formatValue(Math.abs(diff)), series.unit]
    .filter(Boolean)
    .join(" ");
  let word = diff > 0 ? "more" : "less";
  if (lowerIsBetter) {
    word = better ? "faster" : "slower";
  }
  return {
    text: `${better ? "▲" : "▼"} ${amount} ${word} than ${whenLabel(previous, point)}`,
    better,
  };
}

/** Bar length of an earlier result: share of the best in the list (better is longer). */
function barShare(value: number, all: number[], series: ResultSeries): number {
  const best = series.better === "lower" ? Math.min(...all) : Math.max(...all);
  if (best === 0 || value === 0) {
    return 0;
  }
  const share = series.better === "lower" ? best / value : value / best;
  return Math.max(0.08, Math.min(1, share));
}

const EARLIER_COUNT = 5;

export function AthleticRecordDetail({
  record,
  progress,
  timeZone,
}: {
  record: StudentRecordView;
  /** The student's results for this record's template and metric. */
  progress: DrillProgress;
  timeZone: string;
}) {
  const { series } = progress;
  const result = seriesResult(record, series);
  // Rejected results are not in `points`; place this one by its date.
  const index = progress.points.findIndex((p) => p.record.id === record.id);
  const before =
    index >= 0
      ? progress.points.slice(0, index)
      : progress.points.filter((p) => p.record.recordedOn <= record.recordedOn);
  const earlier = before.reverse();
  const previousVerified = earlier.find((p) => p.record.status === "verified");
  const change =
    result && previousVerified && record.status !== "rejected"
      ? changeLabel({ record, result }, previousVerified, series)
      : null;
  const shown = earlier.slice(0, EARLIER_COUNT);
  const values = shown.map((p) => p.result.value);
  const value: number | null = result ? result.value : null;
  const outOf: number | null = result ? result.outOf : null;

  return (
    <div className="grid items-start gap-5 md:gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-[10px]">
          <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label md:text-[13px]">
            {series.label}
          </p>
          <h1 className="flex flex-wrap items-baseline gap-[6px] text-ink">
            <span className="font-display text-[72px] leading-[72px]">
              {value === null ? "—" : formatValue(value)}
            </span>
            {outOf === null && series.unit ? (
              <span className="font-semibold text-[20px] leading-6">
                {series.unit}
              </span>
            ) : null}
            {outOf === null ? null : (
              <span className="font-semibold text-[20px] leading-6">
                of {outOf}
              </span>
            )}
            {change ? (
              <span
                className={cn(
                  "pl-2 font-semibold text-sm leading-[18px]",
                  change.better ? "text-success" : "text-muted"
                )}
              >
                {change.text}
              </span>
            ) : null}
          </h1>
          <RecordStatusPill record={record} timeZone={timeZone} />
        </div>
        {record.status === "rejected" && record.reviewNote ? (
          <ReviewNote note={record.reviewNote} />
        ) : null}
        <div className="flex flex-col">
          <DetailRows
            rows={[
              { label: "Date taken", value: shortDate(record.recordedOn) },
              ...(record.recordedByPerson
                ? [
                    {
                      label: "Logged by",
                      value: personLabel(record.recordedByPerson),
                    },
                  ]
                : []),
            ]}
          />
          <div className="border-line border-t">
            <FileRow record={record} />
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-5">
        {shown.length > 0 ? (
          <section aria-labelledby="earlier-results" className="flex flex-col">
            <h2
              className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
              id="earlier-results"
            >
              Earlier results
            </h2>
            <ul className="flex flex-col">
              {shown.map((p) => (
                <li className="border-line border-b" key={p.record.id}>
                  <Link
                    className="flex items-center gap-3 py-3 outline-none hover:bg-fog/60 focus-visible:bg-fog"
                    params={{ recordId: p.record.id }}
                    to="/student/records/$recordId"
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                      <span className="font-semibold text-[15px] text-ink leading-5">
                        {formatResult(p.result, series)}
                      </span>
                      <span className="text-[13px] text-muted leading-4">
                        {shortDate(p.record.recordedOn)} ·{" "}
                        {p.record.status === "verified"
                          ? "verified"
                          : "waiting for review"}
                      </span>
                    </span>
                    <span
                      aria-hidden="true"
                      className="flex h-[6px] w-[120px] shrink-0 rounded-full bg-fog"
                    >
                      <span
                        className="h-[6px] rounded-full bg-[#C8C8C8]"
                        style={{
                          width: `${Math.round(barShare(p.result.value, [...values, value ?? p.result.value], series) * 100)}%`,
                        }}
                      />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <p className="text-[13px] text-muted leading-[18px]">
          {FOOTNOTE[record.status]}
        </p>
      </div>
    </div>
  );
}

function academicRows(data: AcademicData): { label: string; value: string }[] {
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

function uploadedLine(record: StudentRecordView, timeZone: string): string {
  const uploaded = `Uploaded ${dayMonth(toDateOnly(record.createdAt, timeZone))}`;
  if (record.status !== "rejected") {
    return uploaded;
  }
  const by = record.reviewedBy ? ` by ${personLabel(record.reviewedBy)}` : "";
  const on = record.reviewedAt
    ? ` ${dayMonth(toDateOnly(record.reviewedAt, timeZone))}`
    : "";
  // The server records who reviewed it, not when.
  return by || on ? `${uploaded} · reviewed${on}${by}` : uploaded;
}

function AcademicFile({
  record,
  data,
}: {
  record: StudentRecordView;
  data: AcademicData;
}) {
  const fileMeta = [
    data.contentType ? fileKindLabel(data.contentType) : null,
    data.fileSize ? formatFileSize(data.fileSize) : null,
  ]
    .filter(Boolean)
    .join(" · ");
  const hasFile = record.hasFile || Boolean(data.fileName);
  return (
    <div className="flex items-center gap-[14px] rounded-[20px] border border-line p-[14px]">
      <span className="flex h-16 w-[52px] shrink-0 items-center justify-center rounded-[10px] bg-fog text-muted">
        <DocumentIcon />
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[3px]">
        <span className="truncate font-semibold text-[15px] text-ink leading-5">
          {hasFile
            ? (data.fileName ?? ACADEMIC_KIND_LABEL[data.kind])
            : "No file attached"}
        </span>
        {hasFile && fileMeta ? (
          <span className="text-[13px] text-muted leading-4">{fileMeta}</span>
        ) : null}
        {hasFile ? null : (
          <span className="text-[13px] text-muted leading-4">
            The values were typed in. Your coach checks them.
          </span>
        )}
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
      </span>
    </div>
  );
}

export function AcademicRecordDetail({
  record,
  timeZone,
  canDelete,
}: {
  record: StudentRecordView;
  timeZone: string;
  /** The student sent it and it is still pending. */
  canDelete: boolean;
}) {
  const data = academicData(record);
  const rejected = record.status === "rejected";
  const rows = rejected ? [] : academicRows(data);

  return (
    <div className="flex flex-1 flex-col justify-between gap-8 md:justify-start">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-[10px]">
          {rejected ? (
            <span className="self-start rounded-full bg-orange-deep px-3 py-1 font-semibold text-[13px] text-white leading-4">
              Rejected
            </span>
          ) : (
            <RecordStatusPill record={record} timeZone={timeZone} />
          )}
          <h1 className="font-display text-[48px] text-ink uppercase leading-[46px] md:text-display-sm md:leading-[95%]">
            {academicTitle(data)}
          </h1>
          <p className="text-muted text-sm leading-[18px]">
            {uploadedLine(record, timeZone)}
          </p>
        </div>

        {rejected && record.reviewNote ? (
          <ReviewNote note={record.reviewNote} />
        ) : null}

        <AcademicFile data={data} record={record} />

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
        {record.status === "verified" ? (
          <p className="text-[13px] text-muted leading-[18px]">
            Verified records are final. Ask your coach if something looks wrong.
          </p>
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
      {canDelete ? (
        <div className="flex flex-col gap-3">
          <DeleteRecordButton
            academyId={record.academyId}
            recordId={record.id}
          />
          <p className="text-center text-muted text-sm leading-[18px]">
            You can delete it until your coach reviews it.
          </p>
        </div>
      ) : null}
    </div>
  );
}

function DeleteRecordButton({
  academyId,
  recordId,
}: {
  academyId: Id;
  recordId: Id;
}) {
  const navigate = useNavigate();
  const remove = useDeleteRecord();
  const offline = useIsOffline();
  const confirm = useCallback(async () => {
    try {
      await remove.mutateAsync({ academyId, recordId });
      toast.success("Record deleted");
      await navigate({
        to: "/student/progress",
        search: { show: "report_cards" },
      });
    } catch (error) {
      toast.error(errorMessage(error, "It wasn’t deleted. Try again."));
    }
  }, [academyId, navigate, recordId, remove]);
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button
            className="w-full md:w-auto md:self-start"
            disabled={offline}
            variant="outline"
          />
        }
      >
        {offline ? "Deleting needs a connection" : "Delete"}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this record?</DialogTitle>
          <DialogDescription>
            Your coach won’t see it. You can upload it again later.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost" />}>Keep it</DialogClose>
          <Button
            disabled={remove.isPending}
            onClick={confirm}
            variant="destructive"
          >
            {remove.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
