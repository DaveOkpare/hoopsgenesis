import { cn } from "@hoops-genesis/ui/lib/utils";

import { PhoneOnlyNotice } from "@/components/app-shell/phone-nudge-card";
import {
  dayMonth,
  toDateOnly,
  weekdayShort,
} from "@/features/student-calendar/dates";
import {
  eventCoach,
  eventTimeRange,
  eventTitle,
} from "@/features/student-calendar/selectors";
import type { NextSession } from "@/features/student-home/queries";
import { personLabel } from "@/features/student-records/record-data";
import { formatTime } from "@/lib/format";

/*
 * Next-session card on Today. Desktop follows "[Student · Web] Home" (4VW-0), phones
 * "Today · check in" (3RS-0) and "Today · checked out" (578-0). Checking in and out
 * needs the phone app (spec 5OE-0), so where the Check in / Check out button would be
 * the web shows <PhoneOnlyNotice /> at every width.
 */

const MINUTES_PER_HOUR = 60;
/** Check-in opens 30 min before the start and closes 60 min after the end. */
const OPENS_BEFORE_MIN = 30;
const CLOSES_AFTER_MIN = 60;

function toMinutes(time: string): number {
  const [hours = 0, minutes = 0] = time.split(":").map(Number);
  return hours * MINUTES_PER_HOUR + minutes;
}

function fromMinutes(total: number): string {
  const hours = Math.floor(total / MINUTES_PER_HOUR);
  const minutes = total % MINUTES_PER_HOUR;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

type CardState = "upcoming" | "checked-in" | "checked-out";

function cardState(session: NextSession): CardState {
  if (session.attendance?.checkOutAt) {
    return "checked-out";
  }
  return session.attendance?.checkInAt ? "checked-in" : "upcoming";
}

interface Labels {
  desktop: string;
  phone: string;
}

function labelsFor(
  session: NextSession,
  state: CardState,
  timeZone: string
): Labels {
  if (state === "checked-out") {
    return { desktop: "Done for today", phone: "Done for today" };
  }
  if (state === "checked-in") {
    return { desktop: "Checked in · Today", phone: "You’re checked in" };
  }
  const { event, now } = session;
  const isToday = event.startDate === toDateOnly(now, timeZone);
  const day = isToday
    ? "Today"
    : `${weekdayShort(event.startDate)} ${dayMonth(event.startDate)}`;
  const desktop = `Next session · ${day}`;
  if (!(isToday && event.startTime)) {
    return { desktop, phone: desktop };
  }
  const minutesToStart =
    toMinutes(event.startTime) - toMinutes(formatTime(now, timeZone));
  if (minutesToStart > 0 && minutesToStart <= MINUTES_PER_HOUR) {
    return { desktop, phone: `Starts in ${minutesToStart} min` };
  }
  if (minutesToStart <= 0) {
    return { desktop: "On now", phone: "On now" };
  }
  return { desktop, phone: desktop };
}

function TimeTile({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-1 basis-0 flex-col gap-1 rounded-[18px] bg-white/8 px-4 py-[14px]">
      <dt className="font-medium text-[12px] text-white/64 uppercase leading-4 tracking-label">
        {label}
      </dt>
      <dd className="font-display text-[36px] text-white leading-[38px]">
        {value ?? "—"}
      </dd>
    </div>
  );
}

export function SessionCard({
  session,
  timeZone,
}: {
  session: NextSession;
  timeZone: string;
}) {
  const { event, attendance } = session;
  const state = cardState(session);
  const labels = labelsFor(session, state, timeZone);
  const coach = eventCoach(event);
  const times = eventTimeRange(event);
  const start = event.startTime ? toMinutes(event.startTime) : null;
  const end = event.endTime ? toMinutes(event.endTime) : start;
  const opensAt = start === null ? null : fromMinutes(start - OPENS_BEFORE_MIN);
  const closesAt = end === null ? null : fromMinutes(end + CLOSES_AFTER_MIN);
  const checkInAt = attendance?.checkInAt
    ? formatTime(attendance.checkInAt, timeZone)
    : null;
  const checkOutAt = attendance?.checkOutAt
    ? formatTime(attendance.checkOutAt, timeZone)
    : null;
  const tickedBy =
    session.verifiedBy && attendance?.verifiedAt
      ? `${personLabel(session.verifiedBy)} ticked you in at ${formatTime(attendance.verifiedAt, timeZone)}`
      : null;

  return (
    <section
      aria-label="Next session"
      className="flex flex-col justify-between gap-7 rounded-lg bg-ink p-7 max-md:gap-[18px] max-md:p-5 md:min-w-0 md:flex-[1.2] md:basis-0"
    >
      {/* Desktop heading (4VW-0) */}
      <div className="flex flex-col gap-[10px] max-md:hidden">
        <p className="font-medium text-[13px] text-white/64 uppercase leading-4 tracking-label">
          {labels.desktop}
        </p>
        <h2 className="font-display text-[48px] text-white uppercase leading-[46px]">
          {eventTitle(event, " · ")}
        </h2>
        <p className="text-[15px] text-white/72 leading-5">
          {[times, event.location, coach].filter(Boolean).join(" · ")}
        </p>
      </div>

      {/* Phone heading (3RS-0, 578-0) */}
      <div className="flex flex-col gap-[18px] md:hidden">
        <div className="flex items-center justify-between gap-3">
          <p className="font-semibold text-[#BDBDBD] text-[13px] uppercase leading-4 tracking-label">
            {labels.phone}
          </p>
          <p className="text-[#BDBDBD] text-sm leading-[18px]">{times}</p>
        </div>
        <div className="flex flex-col gap-[2px]">
          <h2 className="font-display text-2xl text-white uppercase leading-none">
            {eventTitle(event)}
          </h2>
          <p className="text-[#BDBDBD] text-sm leading-[18px]">
            {[event.location, coach].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {state === "upcoming" ? (
        <div className="flex flex-col gap-[18px]">
          <PhoneOnlyNotice
            description={
              opensAt
                ? `Scan the code at the entrance from ${opensAt}. The app checks you are at the academy.`
                : undefined
            }
          />
          {closesAt ? (
            <p className="text-center text-[#BDBDBD] text-[13px] leading-4 md:hidden">
              Check-in is open until {closesAt}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex flex-col gap-[18px]">
          <dl className="flex gap-[10px]">
            <TimeTile label="Checked in" value={checkInAt} />
            <TimeTile label="Checked out" value={checkOutAt} />
          </dl>
          {state === "checked-in" ? (
            <PhoneOnlyNotice
              description="Scan the code again when you leave. The app checks you are at the academy."
              title="Check out with your phone"
            />
          ) : null}
          {state === "checked-out" ? (
            <p
              className={cn(
                "text-center text-[#BDBDBD] text-[13px] leading-4",
                !tickedBy && "text-white/64"
              )}
            >
              {tickedBy ?? "Your coach hasn’t ticked you in yet."}
            </p>
          ) : null}
        </div>
      )}
    </section>
  );
}
