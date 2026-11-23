import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

import { ChevronDownIcon, TickIcon } from "@/components/student/icons";
import type { AttendanceSummary } from "@/features/student-attendance/summary";
import {
  type MonthKey,
  monthLabel,
  monthShortLabel,
} from "@/features/student-calendar/dates";
import type { DayCell } from "@/features/student-calendar/month-grid";
import type { AttendanceRecord, AttendanceStatus } from "@/features/types";

/* Pieces of "[Student] My attendance" (46Z-0). */

const DOT: Record<AttendanceStatus | "upcoming", string> = {
  present: "bg-ink",
  late: "bg-orange",
  absent: "border-2 border-orange-deep",
  excused: "bg-[#C8C8C8]",
  upcoming: "border-[1.5px] border-[#C8C8C8]",
};

const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

function Dot({ kind }: { kind: AttendanceStatus | "upcoming" }) {
  return (
    <span
      aria-hidden="true"
      className={cn("size-2 shrink-0 rounded-full", DOT[kind])}
    />
  );
}

export function attendanceCell(
  row: AttendanceRecord | undefined,
  options: { isToday: boolean; upcoming: boolean }
): DayCell {
  const highlight = options.isToday ? "ink" : undefined;
  if (row) {
    return {
      highlight,
      muted: false,
      description: row.verifiedAt
        ? `${STATUS_LABEL[row.status]}, coach confirmed`
        : STATUS_LABEL[row.status],
      marker: (
        <>
          <Dot kind={row.status} />
          {row.verifiedAt ? <TickIcon className="text-success" /> : null}
        </>
      ),
    };
  }
  if (options.upcoming) {
    return {
      highlight,
      muted: true,
      description: "Upcoming session",
      marker: <Dot kind="upcoming" />,
    };
  }
  return { highlight, muted: !options.isToday };
}

export function AttendanceLegend() {
  const items: { label: string; mark: ReactNode }[] = [
    { label: "Present", mark: <Dot kind="present" /> },
    { label: "Late", mark: <Dot kind="late" /> },
    { label: "Absent", mark: <Dot kind="absent" /> },
    { label: "Excused", mark: <Dot kind="excused" /> },
  ];
  return (
    <ul
      aria-label="Key"
      className="flex flex-wrap gap-x-[14px] gap-y-[6px] text-[12px] text-ink-soft leading-4"
    >
      {items.map((item) => (
        <li className="flex items-center gap-[6px]" key={item.label}>
          {item.mark}
          {item.label}
        </li>
      ))}
      <li className="flex items-center gap-1">
        <TickIcon className="text-success" height={10} width={10} />
        Coach confirmed
      </li>
    </ul>
  );
}

function SummaryTile({
  value,
  label,
  tone,
}: {
  value: string;
  label: string;
  tone: "ink" | "fog";
}) {
  return (
    <div
      className={cn(
        "flex flex-1 basis-0 flex-col-reverse justify-end gap-[2px] rounded-md px-[14px] py-3 md:gap-1 md:rounded-[20px] md:px-[22px] md:py-5",
        tone === "ink" ? "bg-ink" : "bg-fog"
      )}
    >
      <dt
        className={cn(
          "text-[13px] leading-4 md:text-sm md:leading-[18px]",
          tone === "ink" ? "text-[#BDBDBD]" : "text-muted"
        )}
      >
        {label}
      </dt>
      <dd
        className={cn(
          "font-display text-[32px] leading-none md:text-[44px]",
          tone === "ink" ? "text-white" : "text-ink"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

export function AttendanceSummaryTiles({
  summary,
  periodLabel,
  className,
}: {
  summary: AttendanceSummary;
  periodLabel: string;
  className?: string;
}) {
  return (
    <dl className={cn("flex gap-2", className)}>
      <SummaryTile
        label={periodLabel}
        tone="ink"
        value={summary.rate === null ? "—" : `${summary.rate}%`}
      />
      <SummaryTile
        label="Sessions"
        tone="fog"
        value={`${summary.attended}/${summary.counted}`}
      />
      <SummaryTile label="In a row" tone="fog" value={String(summary.streak)} />
    </dl>
  );
}

export function MonthPicker({
  month,
  months,
  onChange,
}: {
  month: MonthKey;
  months: MonthKey[];
  onChange: (month: MonthKey) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Month: ${monthLabel(month)}`}
        className="flex cursor-pointer items-center gap-[6px] rounded-full bg-fog px-3 py-[7px] font-semibold text-ink text-sm leading-[18px] outline-none hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink"
      >
        {monthShortLabel(month)}
        <ChevronDownIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuRadioGroup onValueChange={onChange} value={month}>
          {months.map((m) => (
            <DropdownMenuRadioItem key={m} value={m}>
              {monthLabel(m)}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
