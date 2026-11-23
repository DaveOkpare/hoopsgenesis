import { CountryDot } from "@hoops-genesis/ui/components/chip";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type { MyAttendance } from "@/features/student-attendance/queries";
import { dayOfMonth, weekdayShort } from "@/features/student-calendar/dates";
import type { StudentEvent } from "@/features/student-calendar/queries";
import {
  agendaMeta,
  eventTitle,
  isCancelledOn,
} from "@/features/student-calendar/selectors";
import type { Country, DateOnly } from "@/features/types";
import { formatLongDate, formatTime } from "@/lib/format";

/*
 * One event row from "[Student] Calendar" (49N-0): today in ink, cancelled sessions
 * dashed and struck through (never hidden), academy-wide events tagged.
 */

type Tone = "today" | "default" | "cancelled";
type LineTone = "good" | "bad" | "muted";

const TONE = {
  today: {
    card: "bg-ink",
    weekday: "text-[#BDBDBD]",
    date: "text-white",
    title: "text-white",
    meta: "text-[#BDBDBD]",
    line: {
      good: "text-[#7FD9A5]",
      bad: "text-orange",
      muted: "text-[#BDBDBD]",
    },
  },
  default: {
    card: "border border-line",
    weekday: "text-muted",
    date: "text-ink",
    title: "text-ink",
    meta: "text-muted",
    line: {
      good: "text-success",
      bad: "text-orange-deep",
      muted: "text-muted",
    },
  },
  cancelled: {
    card: "border border-stone border-dashed",
    weekday: "text-muted",
    date: "text-[#B0B0B0]",
    title: "text-[#8A8A8A] line-through decoration-1",
    meta: "font-semibold text-orange-deep",
    line: { good: "", bad: "", muted: "" },
  },
} satisfies Record<
  Tone,
  {
    card: string;
    weekday: string;
    date: string;
    title: string;
    meta: string;
    line: Record<LineTone, string>;
  }
>;

function attendanceLine(
  row: MyAttendance | undefined,
  timeZone: string
): { text: string; tone: LineTone } | null {
  if (!row) {
    return null;
  }
  if (row.status === "absent") {
    return { text: "Missed", tone: "bad" };
  }
  if (row.status === "excused") {
    return { text: "Excused", tone: "muted" };
  }
  if (!row.checkInAt) {
    return { text: row.status === "late" ? "Late" : "Present", tone: "good" };
  }
  const late = row.status === "late" ? " · late" : "";
  return {
    text: `Checked in ${formatTime(row.checkInAt, timeZone)}${late}`,
    tone: "good",
  };
}

function toneFor(cancelled: boolean, isToday: boolean): Tone {
  if (cancelled) {
    return "cancelled";
  }
  return isToday ? "today" : "default";
}

export function EventCard({
  event,
  date,
  today,
  attendance,
  country,
  timeZone,
}: {
  event: StudentEvent;
  /** The day this row is for (multi-day events appear on each of their days). */
  date: DateOnly;
  today: DateOnly;
  attendance?: MyAttendance;
  /** The academy's country, for the "Whole academy" dot. */
  country: Country;
  timeZone: string;
}) {
  const cancelled = isCancelledOn(event, date);
  const styles = TONE[toneFor(cancelled, date === today)];
  const line = cancelled ? null : attendanceLine(attendance, timeZone);
  const meta = cancelled
    ? `Cancelled${event.cancelReason ? ` · ${event.cancelReason}` : ""}`
    : agendaMeta(event);
  const title = eventTitle(event);

  return (
    <article
      aria-label={`${formatLongDate(date, timeZone)}: ${title}${cancelled ? ", cancelled" : ""}`}
      className={cn("flex gap-[14px] rounded-md p-[14px]", styles.card)}
    >
      <p
        aria-hidden="true"
        className="flex w-11 shrink-0 flex-col items-center"
      >
        <span
          className={cn(
            "font-semibold text-[12px] uppercase leading-4",
            styles.weekday
          )}
        >
          {weekdayShort(date)}
        </span>
        <span
          className={cn("font-display text-[26px] leading-[110%]", styles.date)}
        >
          {dayOfMonth(date)}
        </span>
      </p>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col",
          event.teamId ? "gap-[2px]" : "gap-1"
        )}
      >
        <h3
          className={cn(
            "font-semibold text-[15px] leading-[18px]",
            styles.title
          )}
        >
          {title}
        </h3>
        <p className={cn("text-[13px] leading-4", styles.meta)}>{meta}</p>
        {line ? (
          <p
            className={cn(
              "font-semibold text-[13px] leading-4",
              styles.line[line.tone]
            )}
          >
            {line.text}
          </p>
        ) : null}
        {event.teamId ? null : (
          <p className="flex items-center gap-[6px] self-start rounded-full bg-fog px-2 py-[3px] font-medium text-[12px] text-ink-soft leading-4">
            <CountryDot className="size-[6px]" country={country} />
            Whole academy
          </p>
        )}
      </div>
    </article>
  );
}
