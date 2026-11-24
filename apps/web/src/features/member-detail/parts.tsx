/*
 * Building blocks shared by the admin member detail and the coach's student detail
 * (Paper 8JO-0, DNS-0, DTR-0 on web; 7F2-0, CHQ-0, CB8-0 on phone).
 */
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { ChevronRight } from "lucide-react";
import { type MouseEvent, type ReactNode, useCallback } from "react";

import type {
  AttendanceMonth,
  AttendanceSession,
  StudentRecordItem,
} from "@/features/member-detail/queries";
import type { DateOnly } from "@/features/types";
import { firstName } from "@/lib/format";

/** "U14 and U16", "U12, U14 and U16". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) {
    return names[0] ?? "";
  }
  return `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

/** "Coach Patrick, Coach Sharika". */
export function coachNames(coaches: { name: string }[]): string {
  return coaches.map((c) => `Coach ${firstName(c.name)}`).join(", ");
}

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function parts(date: DateOnly) {
  const d = new Date(`${date.slice(0, 10)}T12:00:00Z`);
  return {
    day: d.getUTCDate(),
    month: MONTHS[d.getUTCMonth()] ?? "",
    weekday: WEEKDAYS[d.getUTCDay()] ?? "",
    year: d.getUTCFullYear(),
  };
}

/** "November" for "2026-11-..". */
export function monthName(date: DateOnly): string {
  return parts(date).month;
}

/** "14 Nov". */
export function dayMonth(date: DateOnly): string {
  const p = parts(date);
  return `${p.day} ${p.month.slice(0, 3)}`;
}

/** "Fri 20 Nov". */
export function weekdayDayMonth(date: DateOnly): string {
  return `${parts(date).weekday} ${dayMonth(date)}`;
}

/** "4 Sep 2026". */
export function dayMonthYear(date: DateOnly): string {
  return `${dayMonth(date)} ${parts(date).year}`;
}

/** "Sep 2026". */
export function shortMonthYear(date: DateOnly): string {
  const p = parts(date);
  return `${p.month.slice(0, 3)} ${p.year}`;
}

/** "Today", "Fri 20 Nov". */
export function sessionDay(date: DateOnly, today: DateOnly): string {
  return date === today ? "Today" : weekdayDayMonth(date);
}

/** "today", "14 Nov". */
export function shortDay(date: DateOnly, today: DateOnly): string {
  return date === today ? "today" : dayMonth(date);
}

export function Card({
  children,
  className,
  tone = "line",
  title,
  action,
  labelledBy,
}: {
  children: ReactNode;
  className?: string;
  tone?: "line" | "fog";
  title?: string;
  action?: ReactNode;
  labelledBy?: string;
}) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={cn(
        "flex flex-col rounded-[20px] px-6 py-[22px] max-md:px-5",
        tone === "fog" ? "bg-fog" : "border border-line",
        className
      )}
    >
      {title ? (
        <div className="flex items-center justify-between gap-3 pb-2">
          <h2
            className="font-semibold text-[17px] text-ink leading-[22px]"
            id={labelledBy}
          >
            {title}
          </h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function KeyValueRow({
  label,
  children,
  last = false,
}: {
  label: string;
  children: ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 py-2 text-sm leading-[18px]",
        !last && "border-line border-b"
      )}
    >
      <dt className="text-muted">{label}</dt>
      <dd className="text-right font-semibold text-ink">{children}</dd>
    </div>
  );
}

/** November / October switch on the attendance and coaching cards. */
export function MonthToggle({
  current,
  previous,
  showingPrevious,
  onChange,
}: {
  current: string;
  previous: string;
  showingPrevious: boolean;
  onChange: (previous: boolean) => void;
}) {
  const options = [
    { label: current, value: false },
    { label: previous, value: true },
  ];
  const handleClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) =>
      onChange(event.currentTarget.dataset.previous === "true"),
    [onChange]
  );
  return (
    <fieldset className="flex gap-1 rounded-full bg-fog p-[3px]">
      <legend className="sr-only">Month</legend>
      {options.map((option) => {
        const active = option.value === showingPrevious;
        return (
          <button
            aria-pressed={active}
            className={cn(
              "min-h-7 cursor-pointer rounded-full px-3 py-1.5 text-[13px] leading-4 outline-none focus-visible:ring-2 focus-visible:ring-ink",
              active
                ? "bg-white font-semibold text-ink"
                : "font-medium text-ink-soft"
            )}
            data-previous={option.value}
            key={option.label}
            onClick={handleClick}
            type="button"
          >
            {option.label}
          </button>
        );
      })}
    </fieldset>
  );
}

const STATUS_TEXT: Record<AttendanceSession["status"], string> = {
  present: "Present",
  late: "Late",
  absent: "Absent",
  excused: "Excused",
};

const STATUS_TONE: Record<AttendanceSession["status"], string> = {
  present: "text-success",
  late: "text-orange-deep",
  absent: "text-orange-deep",
  excused: "text-muted",
};

/** Sessions that count towards the rate, oldest first (the dot strip). */
export function countedSessions(month: AttendanceMonth): AttendanceSession[] {
  return month.sessions.filter((s) => s.status !== "excused").reverse();
}

export function percent(rate: number | null): string {
  return rate === null ? "—" : `${Math.round(rate * 100)}%`;
}

export function sessionsLine(month: AttendanceMonth): string {
  const counted = month.present + month.late + month.absent;
  return `${month.present + month.late} of ${counted} sessions`;
}

/** Web dots (8JO-0): ink present, yellow late, orange outline absent; today ringed. */
function WebDot({
  session,
  today,
}: {
  session: AttendanceSession;
  today: DateOnly;
}) {
  return (
    <span
      className={cn(
        "size-[26px] shrink-0 rounded-sm",
        session.status === "present" && "bg-ink",
        session.status === "late" && "bg-india",
        session.status === "absent" && "border-[1.5px] border-orange bg-white",
        session.date === today &&
          "shadow-[0_0_0_2px_#FFFFFF,0_0_0_4px_var(--color-orange)]"
      )}
      title={`${weekdayDayMonth(session.date)}: ${STATUS_TEXT[session.status]}`}
    />
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-[13px] text-muted leading-4">
      <span
        aria-hidden="true"
        className={cn("size-[10px] rounded-[3px]", swatch)}
      />
      {label}
    </span>
  );
}

/** The attendance card on web (8JO-0, DTR-0): rate, dots, legend, last three sessions. */
export function AttendanceBody({
  month,
  today,
}: {
  month: AttendanceMonth;
  today: DateOnly;
}) {
  const dots = countedSessions(month);
  if (month.sessions.length === 0) {
    return (
      <p className="border-line border-t pt-4 text-muted text-sm leading-5">
        No sessions with attendance this month yet.
      </p>
    );
  }
  return (
    <>
      <div className="flex items-end gap-10 max-md:flex-col max-md:items-start max-md:gap-4">
        <div className="flex flex-col gap-1.5">
          <p className="font-display text-[64px] text-ink leading-[90%]">
            {percent(month.rate)}
          </p>
          <p className="text-muted text-sm leading-[18px]">
            {sessionsLine(month)}
          </p>
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[10px]">
          <div
            aria-label="Sessions this month, oldest first"
            className="flex flex-wrap gap-2 p-1"
            role="img"
          >
            {dots.map((session) => (
              <WebDot key={session.id} session={session} today={today} />
            ))}
          </div>
          <div className="flex flex-wrap gap-4">
            <Legend label={`Present ${month.present}`} swatch="bg-ink" />
            <Legend label={`Late ${month.late}`} swatch="bg-india" />
            <Legend
              label={`Absent ${month.absent}`}
              swatch="border-[1.5px] border-orange"
            />
          </div>
        </div>
      </div>
      <ul className="flex flex-col">
        {month.sessions.slice(0, 3).map((session) => (
          <li
            className="flex items-center gap-4 border-line border-t py-3 text-sm leading-[18px]"
            key={session.id}
          >
            <span className="w-[120px] shrink-0 font-semibold text-ink max-md:w-[92px]">
              {sessionDay(session.date, today)}
            </span>
            <span className="min-w-0 flex-1 text-ink">
              {session.title}, {session.detail}
            </span>
            <span
              className={cn(
                "font-semibold text-[13px] leading-4",
                STATUS_TONE[session.status]
              )}
            >
              {STATUS_TEXT[session.status]}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

export function AttendanceSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4">
      <div className="flex items-end gap-10">
        <Skeleton className="h-[58px] w-[130px]" />
        <div className="flex gap-2">
          {["a", "b", "c", "d", "e", "f"].map((k) => (
            <Skeleton className="size-[26px] rounded-sm" key={k} />
          ))}
        </div>
      </div>
      <Skeleton className="h-[42px]" />
      <Skeleton className="h-[42px]" />
    </div>
  );
}

/** Phone attendance (7F2-0): round dots, black present, orange late, empty absent. */
export function PhoneAttendanceCard({
  month,
  monthLabel,
}: {
  month: AttendanceMonth;
  monthLabel: string;
}) {
  const dots = countedSessions(month);
  return (
    <section className="flex flex-col gap-[10px] rounded-[20px] bg-fog p-4">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-[13px] text-muted leading-4">
            Attendance in {monthLabel}
          </h2>
          <p className="font-display text-[36px] text-ink leading-9">
            {percent(month.rate)}
          </p>
        </div>
        <p className="text-[13px] text-muted leading-4">
          {sessionsLine(month)}
        </p>
      </div>
      {dots.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {dots.map((session) => (
              <span
                className={cn(
                  "size-[18px] shrink-0 rounded-full",
                  session.status === "present" && "bg-ink",
                  session.status === "late" && "bg-orange",
                  session.status === "absent" &&
                    "border-[#C8C8C8] border-[1.5px] bg-white"
                )}
                key={session.id}
                title={`${weekdayDayMonth(session.date)}: ${STATUS_TEXT[session.status]}`}
              />
            ))}
          </div>
          <p className="text-muted text-xs leading-4">
            Black present · orange late · empty absent
          </p>
        </>
      ) : (
        <p className="text-muted text-xs leading-4">
          No sessions with attendance this month yet.
        </p>
      )}
    </section>
  );
}

function ResultIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M3 14l4-5 3 3 2-2.5L15 14"
        fill="none"
        stroke="#111111"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <circle cx="12.5" cy="5.5" fill="#111111" r="1.5" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg aria-hidden="true" height="18" viewBox="0 0 18 18" width="18">
      <path
        d="M4 1.8h6.5L14 5.3v10.9H4z"
        fill="none"
        stroke="#111111"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
      <path
        d="M7 9h4M7 12h4"
        fill="none"
        stroke="#111111"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

export function RecordRow({
  recordType,
  title,
  detail,
  trailing,
}: {
  recordType: "academic" | "athletic";
  title: string;
  detail: string;
  trailing: ReactNode;
}) {
  return (
    <li className="flex items-center gap-[14px] border-line border-t py-3">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-fog">
        {recordType === "athletic" ? <ResultIcon /> : <DocumentIcon />}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[15px] text-ink leading-5">
          {title}
        </span>
        <span className="text-[13px] text-muted leading-4">{detail}</span>
      </span>
      {trailing}
    </li>
  );
}

export function StatusPill({
  tone,
  children,
}: {
  tone: "waiting" | "verified" | "rejected";
  children: ReactNode;
}) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-[10px] py-1 font-semibold text-xs leading-4",
        tone === "verified"
          ? "bg-[#E3F4EA] text-success"
          : "bg-orange-soft text-orange-deep"
      )}
    >
      {children}
    </span>
  );
}

/** "Free throws, 8 of 10", "Report card, first term". */
export function recordTitle(item: StudentRecordItem): string {
  const extra = item.score ?? item.term;
  return extra ? `${item.label}, ${extra}` : item.label;
}

/** The best verified score of each result type ("Best so far"). */
export function bestRecordIds(items: StudentRecordItem[]): Set<string> {
  const best = new Map<string, StudentRecordItem>();
  for (const item of items) {
    if (item.recordType !== "athletic" || item.status !== "verified") {
      continue;
    }
    const score = Number.parseFloat(item.score ?? "");
    const current = best.get(item.label);
    if (
      Number.isFinite(score) &&
      (!current || score > Number.parseFloat(current.score ?? ""))
    ) {
      best.set(item.label, item);
    }
  }
  return new Set([...best.values()].map((item) => item.id));
}

export function RecordsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-3 pt-2">
      {["a", "b", "c"].map((k) => (
        <div className="flex items-center gap-[14px]" key={k}>
          <Skeleton className="size-10 rounded-[12px]" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Phone row with a chevron (7F2-0 Fees / Records / Contact). */
export function PhoneLinkRow({
  title,
  detail,
  tone = "muted",
  children,
}: {
  title: string;
  detail: ReactNode;
  tone?: "muted" | "alert";
  children?: ReactNode;
}) {
  return (
    <span className="flex min-h-11 items-center gap-3 border-line border-b py-[13px]">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="font-semibold text-[15px] text-ink leading-5">
          {title}
        </span>
        <span
          className={cn(
            "text-[13px] leading-4",
            tone === "alert" ? "font-medium text-orange-deep" : "text-muted"
          )}
        >
          {detail}
        </span>
      </span>
      {children}
      <ChevronRight
        aria-hidden="true"
        className="size-4 shrink-0 text-muted"
        strokeWidth={1.6}
      />
    </span>
  );
}

/** Page skeleton while the person loads (header, two cards). */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <Skeleton className="h-[18px] w-24" />
        <Skeleton className="h-[54px] w-80 max-md:w-56" />
        <Skeleton className="h-6 w-96 max-md:w-64" />
      </div>
      <div className="flex gap-6 max-lg:flex-col">
        <Skeleton className="h-[320px] flex-1 rounded-[20px]" />
        <Skeleton className="h-[320px] w-[380px] rounded-[20px] max-lg:w-full" />
      </div>
    </div>
  );
}
