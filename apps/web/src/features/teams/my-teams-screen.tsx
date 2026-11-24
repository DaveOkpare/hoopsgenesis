import { buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { MobileAcademyBar } from "@/components/app-shell/academy-switcher";
import { PlusIcon } from "@/components/icons";
import {
  addDays,
  formatWeekdayDayMonth,
  localTime,
} from "@/features/sessions/time";
import { joinNames, plural } from "@/features/teams/format";
import {
  type MyTeam,
  myTeamsQueryOptions,
  type TeamNextSession,
} from "@/features/teams/queries";
import type { DateOnly, Id } from "@/features/types";
import { firstName } from "@/lib/format";

const SKELETON_CARDS = ["a", "b"] as const;

/** "November" / "Nov" for a plain date. */
function monthName(date: DateOnly, month: "long" | "short"): string {
  return new Intl.DateTimeFormat("en-GB", { month, timeZone: "UTC" }).format(
    new Date(`${date}T12:00:00Z`)
  );
}

/** "Under 14" from "U14"; other age groups as typed. */
const AGE_GROUP = /^U(\d+)$/i;
function ageLabel(ageGroup: string | null): string | null {
  const match = ageGroup?.match(AGE_GROUP);
  return match ? `Under ${match[1]}` : ageGroup;
}

/** "Coaches: you and Coach Sharika", "Coach: you". */
function coachesLine(item: MyTeam, viewerId: Id): string {
  const isViewerOn = item.coaches.some((c) => c.id === viewerId);
  const others = item.coaches
    .filter((c) => c.id !== viewerId)
    .map((c) => `Coach ${firstName(c.name)}`);
  const parts = isViewerOn ? ["you", ...others] : others;
  if (parts.length === 0) {
    return "No coach yet";
  }
  return `${parts.length === 1 ? "Coach" : "Coaches"}: ${joinNames(parts)}`;
}

/** "Today", "Tomorrow" or "Wed 25 Nov". */
function dayLabel(date: DateOnly, today: DateOnly): string {
  if (date === today) {
    return "Today";
  }
  if (date === addDays(today, 1)) {
    return "Tomorrow";
  }
  return formatWeekdayDayMonth(date);
}

const WEEK_DAYS = 6;

/** Phone tile: "Today", "Thu" within the week, else "26 Nov" (fits the small tile). */
function shortDayLabel(date: DateOnly, today: DateOnly): string {
  if (date === today) {
    return "Today";
  }
  const [weekday = "", ...dayMonth] = formatWeekdayDayMonth(date).split(" ");
  return date <= addDays(today, WEEK_DAYS) ? weekday : dayMonth.join(" ");
}

function whenLabel(
  session: TeamNextSession,
  today: DateOnly,
  short = false
): string {
  const day = short
    ? shortDayLabel(session.sessionDate, today)
    : dayLabel(session.sessionDate, today);
  return session.startTime ? `${day} ${session.startTime}` : day;
}

/** The soonest next session across the cards gets the orange dot (8RA-0). */
function soonestEventId(items: MyTeam[]): Id | null {
  const [first] = items
    .flatMap((item) => (item.nextSession ? [item.nextSession] : []))
    .sort((a, b) =>
      `${a.sessionDate} ${a.startTime ?? ""}`.localeCompare(
        `${b.sessionDate} ${b.startTime ?? ""}`
      )
    );
  return first?.eventId ?? null;
}

function ChevronRight({ size, stroke }: { size: number; stroke: string }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 14 14" width={size}>
      <path
        d="M5.5 3l4 4-4 4"
        fill="none"
        stroke={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function AddPersonIcon() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="20"
      viewBox="0 0 18 18"
      width="20"
    >
      <circle
        cx="7"
        cy="6"
        fill="none"
        r="3"
        stroke="#3D3D3D"
        strokeWidth="1.6"
      />
      <path
        d="M1.5 16c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M14 6v5M11.5 8.5h5"
        fill="none"
        stroke="#3D3D3D"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

function Pill({ tone, children }: { tone: "sport" | "age"; children: string }) {
  return (
    <span
      className={cn(
        "rounded-full px-[10px] py-1 text-[12px] leading-4",
        tone === "sport"
          ? "bg-orange-soft font-semibold text-orange-deep"
          : "bg-fog font-medium text-ink-soft"
      )}
    >
      {children}
    </span>
  );
}

function BigStat({
  value,
  label,
  alert = false,
}: {
  value: string;
  label: string;
  alert?: boolean;
}) {
  return (
    <div className="flex min-w-0 shrink grow basis-0 flex-col gap-1">
      <span
        className={cn(
          "font-display text-2xl leading-10",
          alert ? "text-orange-deep" : "text-ink"
        )}
      >
        {value}
      </span>
      <span className="text-[13px] text-muted leading-4">{label}</span>
    </div>
  );
}

function percentLabel(percent: number | null): string {
  return percent === null ? "—" : `${percent}%`;
}

/** Web card (8RA-0 "Team / U14"). */
function TeamCard({
  item,
  today,
  timeZone,
  viewerId,
  highlighted,
}: {
  item: MyTeam;
  today: DateOnly;
  timeZone: string;
  viewerId: Id;
  highlighted: boolean;
}) {
  const month = monthName(today, "long");
  const age = ageLabel(item.team.ageGroup);
  const next = item.nextSession;
  const opens =
    highlighted && next?.checkInOpensAt
      ? localTime(new Date(next.checkInOpensAt), timeZone)
      : null;
  return (
    <article className="flex min-w-0 flex-col gap-6 rounded-lg border border-line p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-col gap-[10px]">
          {item.sport || age ? (
            <div className="flex gap-[6px]">
              {item.sport ? <Pill tone="sport">{item.sport}</Pill> : null}
              {age ? <Pill tone="age">{age}</Pill> : null}
            </div>
          ) : null}
          <h2 className="break-words font-display text-[72px] text-ink uppercase leading-[68px]">
            {item.team.name}
          </h2>
          <p className="text-muted text-sm leading-[18px]">
            {coachesLine(item, viewerId)}
          </p>
        </div>
        <Link
          className="flex shrink-0 items-center gap-2 rounded-full bg-ink px-[18px] py-[11px] font-semibold text-sm text-white leading-[18px] outline-none transition-colors hover:bg-ink/85 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2"
          params={{ teamId: item.team.id }}
          to="/coach/teams/$teamId"
        >
          Open team
          <span className="sr-only"> {item.team.name}</span>
          <ChevronRight size={14} stroke="#FFFFFF" />
        </Link>
      </div>
      <div className="flex gap-4 border-line border-t pt-5">
        <BigStat
          label={item.studentCount === 1 ? "Student" : "Students"}
          value={String(item.studentCount)}
        />
        <BigStat
          label={`Attendance in ${month}`}
          value={percentLabel(item.attendancePercent)}
        />
        <BigStat
          alert={item.unpaidCount > 0}
          label={`Haven’t paid ${month}`}
          value={String(item.unpaidCount)}
        />
      </div>
      {next ? (
        <Link
          className="flex items-center gap-[10px] rounded-[14px] bg-fog px-4 py-[14px] text-ink text-sm leading-[18px] outline-none transition-colors hover:bg-stone/50 focus-visible:ring-2 focus-visible:ring-ink"
          params={{ eventId: next.eventId }}
          search={{ date: next.sessionDate }}
          to="/coach/sessions/$eventId"
        >
          <span
            aria-hidden="true"
            className={cn(
              "size-2 shrink-0 rounded-full",
              highlighted ? "bg-orange" : "bg-ink"
            )}
          />
          <span className="min-w-0 grow basis-0">
            <span className="font-semibold">{whenLabel(next, today)}</span>
            {" · "}
            {[
              next.title,
              next.location,
              opens ? `check-in opens ${opens}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </Link>
      ) : (
        <p className="rounded-[14px] bg-fog px-4 py-[14px] text-muted text-sm leading-[18px]">
          No session planned in the next four weeks.
        </p>
      )}
    </article>
  );
}

function PhoneTile({
  value,
  label,
  tone = "number",
  className,
}: {
  value: string;
  label: string;
  tone?: "number" | "alert" | "text";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex min-w-0 shrink grow basis-0 flex-col gap-[2px] rounded-[14px] bg-fog px-3 py-[10px]",
        className
      )}
    >
      <span
        className={cn(
          "truncate",
          tone === "text"
            ? "font-bold font-sans text-[15px] text-ink leading-[26px]"
            : "font-display text-xl leading-[26px]",
          tone === "alert" ? "text-orange-deep" : "text-ink"
        )}
      >
        {value}
      </span>
      <span className="text-[12px] text-muted leading-4">{label}</span>
    </div>
  );
}

/** Phone card (C6C-0): the whole card opens the team. */
function PhoneTeamCard({ item, today }: { item: MyTeam; today: DateOnly }) {
  const month = monthName(today, "short");
  const next = item.nextSession;
  return (
    <Link
      className="flex flex-col gap-[14px] rounded-[22px] border border-line p-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
      params={{ teamId: item.team.id }}
      to="/coach/teams/$teamId"
    >
      <span className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-3">
          <span className="font-display text-[44px] text-ink leading-[44px]">
            {item.team.name}
          </span>
          <span className="flex flex-col gap-[2px]">
            {item.sport ? (
              <span className="font-semibold text-[13px] text-orange-deep leading-4">
                {item.sport}
              </span>
            ) : null}
            <span className="text-[13px] text-muted leading-4">
              {plural(item.studentCount, "student", "students")}
            </span>
          </span>
        </span>
        <ChevronRight size={18} stroke="#111111" />
      </span>
      <span className="flex gap-2">
        <PhoneTile
          label={`Here in ${month}`}
          value={percentLabel(item.attendancePercent)}
        />
        <PhoneTile
          label="Haven’t paid"
          tone={item.unpaidCount > 0 ? "alert" : "number"}
          value={String(item.unpaidCount)}
        />
        <PhoneTile
          className="grow-[1.3]"
          label="Next session"
          tone="text"
          value={next ? whenLabel(next, today, true) : "None"}
        />
      </span>
    </Link>
  );
}

function MyTeamsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-5">
      <span className="sr-only">Loading your teams</span>
      <div className="flex gap-5 max-md:hidden max-lg:flex-col">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-[362px] grow basis-0 rounded-lg" key={key} />
        ))}
      </div>
      <div className="flex flex-col gap-5 md:hidden">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-[160px] rounded-[22px]" key={key} />
        ))}
      </div>
    </div>
  );
}

/** "Waiting on someone else" (AGW-0): an admin puts coaches on teams. */
function NoTeamYet() {
  return (
    <section className="flex items-start gap-4 rounded-[20px] bg-orange-soft px-[22px] py-5">
      <span
        aria-hidden="true"
        className="flex size-10 shrink-0 items-center justify-center rounded-full border-[1.5px] border-orange-deep border-dashed font-bold text-orange-deep"
      >
        ?
      </span>
      <div className="flex flex-col gap-1">
        <h2 className="font-semibold text-base text-ink leading-5">
          You’re not on a team yet
        </h2>
        <p className="text-ink-soft text-sm leading-5">
          An academy admin puts coaches on teams. Your students, sessions and
          results show up here once that’s done.
        </p>
      </div>
    </section>
  );
}

/** My teams (CO-10): 8RA-0 on the web, C6C-0 on phones. */
export function MyTeamsScreen({
  academyId,
  academyName,
  timeZone,
  today,
  viewerId,
}: {
  academyId: Id;
  academyName: string;
  timeZone: string;
  today: DateOnly;
  viewerId: Id;
}) {
  // A failure with nothing to show throws to the route's error screen.
  const { data } = useQuery(myTeamsQueryOptions(academyId, today));
  const studentTotal = data?.reduce((sum, t) => sum + t.studentCount, 0) ?? 0;
  const soonest = data ? soonestEventId(data) : null;
  const hasTeams = Boolean(data && data.length > 0);
  return (
    <>
      <MobileAcademyBar />
      <PageHeader>
        <PageHeading className="max-md:gap-[2px]">
          <Eyebrow className="max-md:text-sm max-md:leading-[18px]">
            {data
              ? `${plural(data.length, "team", "teams")} · ${plural(studentTotal, "student", "students")}`
              : "Your teams"}
          </Eyebrow>
          <PageTitle className="leading-[52px] max-md:text-display-sm max-md:leading-[95%]">
            My teams
          </PageTitle>
        </PageHeading>
        <PageActions className="max-md:hidden">
          <Link
            className={buttonVariants({
              size: "lg",
              className: "gap-[10px] px-[22px] py-3 text-[15px] leading-5",
            })}
            to="/coach/calendar/new"
          >
            <PlusIcon />
            New event
          </Link>
        </PageActions>
      </PageHeader>

      {data ? null : <MyTeamsSkeleton />}
      {data && !hasTeams ? <NoTeamYet /> : null}

      {data && hasTeams ? (
        <>
          <div className="grid grid-cols-2 gap-5 max-md:hidden max-lg:grid-cols-1">
            {data.map((item) => (
              <TeamCard
                highlighted={item.nextSession?.eventId === soonest}
                item={item}
                key={item.team.id}
                timeZone={timeZone}
                today={today}
                viewerId={viewerId}
              />
            ))}
          </div>
          <div className="flex flex-col gap-5 md:hidden">
            {data.map((item) => (
              <PhoneTeamCard item={item} key={item.team.id} today={today} />
            ))}
          </div>
          <section className="flex items-center gap-4 rounded-[20px] border border-[#C8C8C8] border-dashed px-[22px] py-[18px] max-md:hidden">
            <AddPersonIcon />
            <div className="flex min-w-0 shrink grow basis-0 flex-col gap-[2px]">
              <h2 className="font-semibold text-[15px] text-ink leading-5">
                Someone missing from a team?
              </h2>
              <p className="text-muted text-sm leading-[18px]">
                Open the team and use Add student. You can add people who
                already joined {academyName}. Only an admin can make a new team.
              </p>
            </div>
          </section>
          <p className="px-1 pt-1 text-[13px] text-muted leading-[18px] md:hidden">
            Open a team to see students, add someone who already joined, or
            check who hasn’t paid. Only an admin can make a new team.
          </p>
        </>
      ) : null}
    </>
  );
}
