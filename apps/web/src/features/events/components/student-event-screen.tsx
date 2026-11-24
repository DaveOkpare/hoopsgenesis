import { buttonVariants } from "@hoops-genesis/ui/components/button";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { GET_THE_APP_HREF } from "@/components/app-shell/phone-nudge-card";
import { BackIcon } from "@/components/coach/coach-icons";
import { ErrorState } from "@/components/error-state";
import {
  BackText,
  backLinkClass,
  DateBlock,
  DetailSkeleton,
  FactRow,
  RowChevron,
  SectionLabel,
} from "@/features/events/components/detail-parts";
import {
  dayMonth,
  joinWords,
  longDate,
  shortDate,
  timesLabel,
  weekdaysOf,
} from "@/features/events/model";
import { type EventDay, eventDayQueryOptions } from "@/features/events/queries";
import { localDate, localTime, zonedInstant } from "@/features/sessions/time";
import type { DateOnly, Id } from "@/features/types";
import type { Membership } from "@/features/viewer/api";
import { ApiError } from "@/lib/api-client";

const ICS_DATE = /[-:]/g;
const MS_DIGITS = /\.\d{3}/;
const ICS_SPECIAL = /[,;\\]/g;
const NON_WORD = /\W+/g;

/** "Mon and Wed until 16 Dec" / "14 to 16 Dec" / null for a one-off. */
export function repeatsText(day: EventDay): string | null {
  if (day.kind === "series") {
    const last = [...day.seriesDates].sort().at(-1);
    return last
      ? `${joinWords(weekdaysOf(day.seriesDates))} until ${dayMonth(last)}`
      : null;
  }
  if (day.kind === "days" && day.event.endDate) {
    return `Every day, ${dayMonth(day.event.startDate)} to ${dayMonth(day.event.endDate)}`;
  }
  return null;
}

/** The phone's round back button and the web's "‹ Calendar" link. */
export function StudentBack({
  to,
  label,
}: {
  to: "/student/calendar" | "/student/attendance";
  label: string;
}) {
  return (
    <>
      <Link
        aria-label={`Back to ${label}`}
        className="mb-[6px] flex size-10 items-center justify-center rounded-full bg-fog text-ink outline-none focus-visible:ring-2 focus-visible:ring-ink md:hidden"
        to={to}
      >
        <BackIcon />
      </Link>
      <Link className={cn(backLinkClass, "max-md:hidden")} to={to}>
        <BackText>{label}</BackText>
      </Link>
    </>
  );
}

function QrIcon({ size }: { size: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 18 18" width={size}>
      <rect
        fill="none"
        height="5.5"
        rx="1"
        stroke="#111111"
        strokeWidth="1.6"
        width="5.5"
        x="2"
        y="2"
      />
      <rect
        fill="none"
        height="5.5"
        rx="1"
        stroke="#111111"
        strokeWidth="1.6"
        width="5.5"
        x="10.5"
        y="2"
      />
      <rect
        fill="none"
        height="5.5"
        rx="1"
        stroke="#111111"
        strokeWidth="1.6"
        width="5.5"
        x="2"
        y="10.5"
      />
      <path
        d="M10.5 10.5h2v2M16 10.5v5.5h-5.5"
        fill="none"
        stroke="#111111"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" height="16" viewBox="0 0 18 18" width="16">
      <rect
        fill="none"
        height="12.5"
        rx="2"
        stroke="#111111"
        strokeWidth="1.6"
        width="14"
        x="2"
        y="3.5"
      />
      <path
        d="M2 7.5h14M6 2v3M12 2v3"
        fill="none"
        stroke="#111111"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** The dark "Check-in opens at 15:00" card (G4Z-0 web, FFE-0 phone). */
function CheckInCard({
  day,
  now,
  timeZone,
}: {
  day: EventDay;
  now: Date;
  timeZone: string;
}) {
  // Already checked in (or marked): the card has nothing left to say.
  if (day.attendance || !(day.checkInOpensAt && day.checkInClosesAt)) {
    return null;
  }
  const opens = new Date(day.checkInOpensAt);
  const closes = new Date(day.checkInClosesAt);
  if (now > closes) {
    return null;
  }
  const title =
    now >= opens
      ? `Check-in is open until ${localTime(closes, timeZone)}`
      : `Check-in opens at ${localTime(opens, timeZone)}`;
  return (
    <section className="flex items-center gap-[18px] rounded-lg bg-ink px-7 py-6 max-md:gap-[14px] max-md:rounded-[20px] max-md:p-[18px]">
      <span className="flex size-[52px] shrink-0 items-center justify-center rounded-[14px] bg-orange max-md:size-11 max-md:rounded-[12px]">
        <span className="max-md:hidden">
          <QrIcon size={26} />
        </span>
        <span className="md:hidden">
          <QrIcon size={22} />
        </span>
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1 max-md:gap-[2px]">
        <h2 className="font-semibold text-[20px] text-white leading-6 max-md:text-base max-md:leading-5">
          {title}
        </h2>
        <p className="text-[#B5B5B5] text-[15px] leading-5 max-md:text-[13px] max-md:leading-4">
          <span className="max-md:hidden">
            Check in with the app on your phone when you arrive. The web can't
            scan the code.
          </span>
          <span className="md:hidden">
            Scan the academy code with the app when you arrive
          </span>
        </p>
      </div>
      <a
        className={cn(
          buttonVariants({ variant: "inverse" }),
          "h-auto shrink-0 rounded-full bg-white px-[18px] py-3 text-[15px] text-ink leading-[18px] max-md:hidden"
        )}
        href={GET_THE_APP_HREF}
      >
        Get the app
      </a>
    </section>
  );
}

function icsStamp(date: Date): string {
  return date.toISOString().replace(ICS_DATE, "").replace(MS_DIGITS, "");
}

/** An .ics file for one session, built in the browser (no server call). */
function icsFor(day: EventDay, location: string, timeZone: string): string {
  const start = zonedInstant(
    day.date,
    day.event.startTime ?? "00:00",
    timeZone
  );
  const end = zonedInstant(day.date, day.event.endTime ?? "23:59", timeZone);
  const icsText = (text: string) => text.replace(ICS_SPECIAL, (m) => `\\${m}`);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hoops Genesis//Calendar//EN",
    "BEGIN:VEVENT",
    `UID:${day.event.id}-${day.date}@hoops-genesis`,
    `DTSTAMP:${icsStamp(new Date())}`,
    `DTSTART:${icsStamp(start)}`,
    `DTEND:${icsStamp(end)}`,
    `SUMMARY:${icsText(day.event.title)}`,
    `LOCATION:${icsText(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function AddToCalendar({
  day,
  location,
  timeZone,
}: {
  day: EventDay;
  location: string;
  timeZone: string;
}) {
  const handleClick = useCallback(() => {
    const blob = new Blob([icsFor(day, location, timeZone)], {
      type: "text/calendar",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${day.event.title.replace(NON_WORD, "-").toLowerCase()}-${day.date}.ics`;
    link.click();
    URL.revokeObjectURL(url);
  }, [day, location, timeZone]);
  return (
    <button
      className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-full border border-line bg-white p-[14px] font-semibold text-[15px] text-ink leading-[18px] outline-none transition-colors hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink max-md:p-[13px]"
      onClick={handleClick}
      type="button"
    >
      <CalendarIcon />
      Add to my calendar
    </button>
  );
}

function NextDates({ day }: { day: EventDay }) {
  if (day.nextDates.length === 0) {
    return null;
  }
  return (
    <section className="flex flex-col rounded-[20px] bg-fog px-6 py-5">
      <SectionLabel className="pb-[6px] font-semibold">Next dates</SectionLabel>
      <ul className="flex flex-col">
        {day.nextDates.map((next) => (
          <li
            className="border-line border-b last:border-b-0"
            key={`${next.eventId}:${next.date}`}
          >
            <Link
              className="flex justify-between gap-3 py-[10px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
              params={{ eventId: next.eventId }}
              search={{ date: next.date }}
              to="/student/events/$eventId"
            >
              <span
                className={cn(
                  "font-semibold text-[15px] leading-5",
                  next.cancelled
                    ? "text-muted line-through decoration-1"
                    : "text-ink"
                )}
              >
                {shortDate(next.date)}
              </span>
              <span
                className={cn(
                  "text-[15px] leading-5",
                  next.cancelled
                    ? "font-semibold text-orange-deep"
                    : "text-muted"
                )}
              >
                {next.cancelled
                  ? "Cancelled"
                  : (day.event.startTime ?? "All day")}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function CancelledDay({ day }: { day: EventDay }) {
  const next = day.nextDates.find((d) => !d.cancelled);
  const kind =
    day.event.eventType === "training" ? "training" : day.event.eventType;
  return (
    <>
      <section className="flex flex-col gap-[6px] rounded-[20px] bg-orange-soft p-[18px]">
        <h2 className="font-semibold text-base text-orange-deep leading-5">
          No {kind} on this day
        </h2>
        <p className="text-ink text-sm leading-5">
          This day was cancelled. Don't come to the academy for it.
        </p>
      </section>
      {next ? (
        <section className="flex flex-col gap-1">
          <SectionLabel>Next {kind}</SectionLabel>
          <Link
            className="flex items-center gap-3 border-line border-b py-3 outline-none focus-visible:ring-2 focus-visible:ring-ink"
            params={{ eventId: next.eventId }}
            search={{ date: next.date }}
            to="/student/events/$eventId"
          >
            <DateBlock date={next.date} />
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="font-semibold text-[15px] text-ink leading-5">
                {day.event.title}
                {day.event.startTime ? `, ${day.event.startTime}` : ""}
              </span>
              {day.event.location ? (
                <span className="text-[13px] text-muted leading-4">
                  {day.event.location}
                </span>
              ) : null}
            </span>
            <RowChevron />
          </Link>
        </section>
      ) : null}
    </>
  );
}

/** Student event detail, one day of it (G4Z-0 web, FFE-0 phone, FHQ-0 cancelled day). */
export function StudentEventScreen({
  membership,
  eventId,
  date,
  now,
}: {
  membership: Membership;
  eventId: Id;
  date?: DateOnly;
  now: Date;
}) {
  const timeZone = membership.academy.timezone;
  const today = localDate(now, timeZone);
  const query = useQuery(
    eventDayQueryOptions(
      { academyId: membership.academy.id, today },
      eventId,
      date
    )
  );
  if (query.data === undefined) {
    return <DetailSkeleton label="Loading event" />;
  }
  if (query.data === null) {
    return (
      <ErrorState
        error={
          new ApiError({
            status: 404,
            code: "not_found",
            message: "Event not found",
          })
        }
        variant="page"
      />
    );
  }
  const day = query.data;
  const isToday = day.date === today;
  const times = timesLabel(day.event.startTime, day.event.endTime);
  const repeats = repeatsText(day);
  const location = day.event.location ?? "";
  return (
    <div className="flex flex-col gap-8 max-md:gap-5">
      <header className="flex flex-col gap-2 max-md:gap-[10px]">
        <StudentBack label="Calendar" to="/student/calendar" />
        <p className="pt-[6px] font-medium text-muted text-sm uppercase leading-[18px] tracking-label max-md:pt-0 max-md:font-semibold max-md:text-[12px] max-md:leading-4">
          {isToday ? "Today · " : ""}
          {longDate(day.date)}
        </p>
        <h1
          className={cn(
            "font-display text-display-sm uppercase leading-[52px] max-md:text-[44px] max-md:leading-[44px]",
            day.cancelled ? "text-muted line-through decoration-1" : "text-ink"
          )}
        >
          {day.event.title}
        </h1>
      </header>
      {day.cancelled ? (
        <div className="flex max-w-[692px] flex-col gap-5">
          <CancelledDay day={day} />
        </div>
      ) : (
        <div className="flex items-start gap-6 max-md:gap-5 max-lg:flex-col max-lg:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            <CheckInCard day={day} now={now} timeZone={timeZone} />
            <dl className="flex flex-col rounded-[20px] border border-line px-7 py-2 max-md:rounded-none max-md:border-0 max-md:p-0">
              <FactRow label="When" size="lg">
                <span className="max-md:hidden">
                  {isToday
                    ? `Today, ${times}`
                    : `${shortDate(day.date)}, ${times}`}
                </span>
                <span className="md:hidden">{times}</span>
              </FactRow>
              {location ? (
                <FactRow label="Where" size="lg">
                  <span className="max-md:hidden">
                    {location}, {membership.academy.name}
                  </span>
                  <span className="md:hidden">{location}</span>
                </FactRow>
              ) : null}
              {day.coachName ? (
                <FactRow label="Coach" size="lg">
                  {day.coachName}
                </FactRow>
              ) : null}
              <FactRow label="Team" size="lg">
                {day.teamName ?? "Whole academy"}
              </FactRow>
              {repeats ? (
                <FactRow label="Repeats" size="lg">
                  {repeats}
                </FactRow>
              ) : null}
            </dl>
            {day.attendance ? (
              <Link
                className="font-semibold text-ink text-sm leading-[18px] underline underline-offset-2"
                params={{ eventId: day.event.id }}
                search={{ date: day.date }}
                to="/student/sessions/$eventId"
              >
                See your attendance for this day
              </Link>
            ) : null}
          </div>
          <aside className="flex w-[380px] shrink-0 flex-col gap-4 max-lg:w-full">
            {day.date >= today ? (
              <AddToCalendar
                day={day}
                location={location}
                timeZone={timeZone}
              />
            ) : null}
            <div className="max-md:hidden">
              <NextDates day={day} />
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
