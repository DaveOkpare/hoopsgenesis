import { Badge } from "@hoops-genesis/ui/components/badge";
import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import {
  ChevronRightIcon,
  FeeIcon,
  UploadIcon,
} from "@/components/student/icons";
import type { AttendanceSummary } from "@/features/student-attendance/summary";
import { dayMonth, weekdayShort } from "@/features/student-calendar/dates";
import type { StudentEvent } from "@/features/student-calendar/queries";
import {
  eventTitle,
  startAndPlace,
} from "@/features/student-calendar/selectors";
import type { FeeDue } from "@/features/student-fees/queries";
import {
  dueMonthName,
  dueStatus,
  overdueDays,
} from "@/features/student-fees/selectors";
import {
  type DrillProgress,
  formatResult,
  formatValue,
} from "@/features/student-progress/selectors";
import { personLabel } from "@/features/student-records/record-data";
import type { DateOnly } from "@/features/types";
import { formatAmount } from "@/lib/format";

const cardLink =
  "outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2";

/** "November fee" card on the web Home (4VW-0). */
export function FeeDueCard({ due, today }: { due: FeeDue; today: DateOnly }) {
  const overdue = overdueDays(due, today) > 0;
  return (
    <section
      aria-label={`${dueMonthName(due)} fee`}
      className="flex min-w-0 flex-1 basis-0 flex-col justify-between gap-5 rounded-lg bg-orange-soft p-7 max-md:hidden"
    >
      <div className="flex flex-col gap-[10px]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-[13px] text-orange-deep uppercase leading-4 tracking-label">
            {dueMonthName(due)} fee
          </h2>
          <Badge variant={overdue ? "danger" : "warning"}>
            {dueStatus(due, today)}
          </Badge>
        </div>
        <p className="flex items-baseline gap-2 text-ink">
          <span className="font-medium text-lg leading-6">{due.currency}</span>
          <span className="font-display text-[64px] leading-16">
            {formatAmount(due.amount)}
          </span>
        </p>
        <p className="text-ink-soft text-sm leading-5">
          Pay at the front desk in cash or by Mobile Money. The admin records it
          and it shows here.
        </p>
      </div>
      <Link
        className="w-fit rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
        to="/student/fees"
      >
        See payment history
      </Link>
    </section>
  );
}

/** Phone Today: "November fee due · 18 days overdue" row (3RS-0). */
export function FeeDueNudge({ due, today }: { due: FeeDue; today: DateOnly }) {
  return (
    <Link
      className={cn(
        "flex items-center gap-3 rounded-md bg-orange-soft px-4 py-[14px] text-ink md:hidden",
        cardLink
      )}
      to="/student/fees"
    >
      <FeeIcon className="shrink-0 text-orange-deep" />
      <span className="flex-1 text-[15px] leading-[18px]">
        <span className="font-semibold">{dueMonthName(due)} fee due</span> ·{" "}
        {dueStatus(due, today)}
      </span>
      <ChevronRightIcon className="shrink-0" />
    </Link>
  );
}

/** Phone Today: "Coming up" list (3RS-0). */
export function ComingUp({ events }: { events: StudentEvent[] }) {
  if (events.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="coming-up" className="flex flex-col md:hidden">
      <h2
        className="pb-[6px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-label"
        id="coming-up"
      >
        Coming up
      </h2>
      <ul className="flex flex-col">
        {events.map((event) => (
          <li
            className="flex gap-[14px] border-line border-b py-3 last:border-b-0"
            key={event.id}
          >
            <span className="flex w-[52px] shrink-0 flex-col">
              <span className="font-semibold text-[15px] text-ink leading-[18px]">
                {weekdayShort(event.startDate)}
              </span>
              <span className="text-[13px] text-muted leading-4">
                {dayMonth(event.startDate)}
              </span>
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="font-semibold text-[15px] text-ink leading-[18px]">
                {eventTitle(event)}
              </span>
              <span className="text-[13px] text-muted leading-4">
                {startAndPlace(event)}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const tileClass =
  "flex min-w-0 flex-1 basis-0 flex-col gap-[18px] rounded-lg p-6 hover:bg-stone/40";

/** "Attendance in November · 92% · 11 of 12 sessions" with a square per session. */
export function AttendanceTile({
  monthName,
  summary,
}: {
  monthName: string;
  summary: AttendanceSummary;
}) {
  return (
    <Link
      className={cn(tileClass, "bg-fog", cardLink)}
      to="/student/attendance"
    >
      <span className="text-muted text-sm leading-[18px]">
        Attendance in {monthName}
      </span>
      <span className="flex items-baseline gap-[10px]">
        <span className="font-display text-display-sm text-ink leading-[56px]">
          {summary.rate === null ? "—" : `${summary.rate}%`}
        </span>
        <span className="text-muted text-sm leading-[18px]">
          {summary.attended} of {summary.counted} sessions
        </span>
      </span>
      <span aria-hidden="true" className="flex flex-wrap gap-[6px]">
        {summary.marks.map((mark) => (
          <span
            className={cn(
              "size-[18px] shrink-0 rounded-[6px]",
              mark.attended ? "bg-ink" : "bg-line"
            )}
            key={mark.id}
          />
        ))}
      </span>
    </Link>
  );
}

/** "Free throws · best verified · 7 of 10 · ▲ 3 since Aug" */
export function ResultTile({
  label,
  progress,
  today,
}: {
  label: string;
  progress: DrillProgress;
  today: DateOnly;
}) {
  const latest = progress.points.at(-1);
  const pending = latest?.record.status === "pending" ? latest : null;
  let note: string | null = null;
  if (pending) {
    const when =
      pending.record.recordedOn === today
        ? "today"
        : `on ${dayMonth(pending.record.recordedOn)}`;
    const who = pending.record.recordedByPerson
      ? personLabel(pending.record.recordedByPerson)
      : "your coach";
    note = `${formatResult(pending.result, progress.series)} ${when} is waiting for ${who} to verify.`;
  } else if (progress.best) {
    note = `Best set on ${dayMonth(progress.best.record.recordedOn)}.`;
  }
  return (
    <Link className={cn(tileClass, "bg-fog", cardLink)} to="/student/progress">
      <span className="text-muted text-sm leading-[18px]">
        {label} · best verified
      </span>
      <span className="flex flex-wrap items-baseline gap-[10px]">
        <span className="font-display text-display-sm text-ink leading-[56px]">
          {progress.best ? formatValue(progress.best.result.value) : "—"}
        </span>
        {progress.suffix ? (
          <span className="text-base text-muted leading-5">
            {progress.suffix}
          </span>
        ) : null}
        {progress.gain ? (
          <span className="font-semibold text-sm text-success leading-[18px]">
            <span aria-hidden="true">▲ </span>
            <span className="sr-only">up </span>
            {progress.gain.label} since {progress.gain.since}
          </span>
        ) : null}
      </span>
      {note ? (
        <span className="text-ink-soft text-sm leading-[18px]">{note}</span>
      ) : null}
    </Link>
  );
}

/** "Add a report card" card with the Upload button. */
export function UploadTile() {
  return (
    <section
      aria-labelledby="add-report-card"
      className="flex min-w-0 flex-1 basis-0 flex-col justify-between gap-[18px] rounded-lg border border-line p-6"
    >
      <div className="flex flex-col gap-2">
        <h2
          className="font-semibold text-ink text-lg leading-6"
          id="add-report-card"
        >
          Add a report card
        </h2>
        <p className="text-muted text-sm leading-5">
          Upload a PDF or photo from your computer. Your coach reviews it.
        </p>
      </div>
      <Link
        className={cn(
          buttonVariants({ size: "sm" }),
          "gap-[10px] self-start px-[18px] py-[10px]"
        )}
        to="/student/records/new"
      >
        <UploadIcon />
        Upload
      </Link>
    </section>
  );
}
