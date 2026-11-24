import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMediaStack,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
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
import { Link, useNavigate } from "@tanstack/react-router";
import { type MouseEvent, useCallback } from "react";

import { PlusIcon } from "@/components/icons";
import {
  coachLine,
  joinNames,
  noCoachLine,
  plural,
} from "@/features/teams/format";
import {
  type CoachCandidate,
  studentsWithoutTeamQueryOptions,
  type TeamListItem,
  teamListQueryOptions,
} from "@/features/teams/queries";
import type { Id } from "@/features/types";
import { useActiveMembership } from "@/features/viewer/queries";
import { firstName, formatDayMonth } from "@/lib/format";

const SKELETON_CARDS = ["a", "b", "c", "d"] as const;

/** Basketball mark from the Teams empty state (1UZ-0). */
function BasketballIcon({ size = 56 }: { size?: number }) {
  return (
    <svg aria-hidden="true" height={size} viewBox="0 0 72 72" width={size}>
      <circle cx="36" cy="36" fill="#EB7724" r="34" />
      <path
        d="M2 36h68M36 2v68M12 12c10 10 10 38 0 48M60 12c-10 10-10 38 0 48"
        fill="none"
        stroke="#111111"
        strokeWidth="3"
      />
    </svg>
  );
}

function attendanceLabel(item: TeamListItem): string {
  return item.attendancePercent === null ? "—" : `${item.attendancePercent}%`;
}

function CardStat({ value, label }: { value: string; label: string }) {
  return (
    <div className="flex flex-col">
      <span className="font-semibold text-[22px] text-ink leading-7">
        {value}
      </span>
      <span className="text-[13px] text-muted leading-4">{label}</span>
    </div>
  );
}

/** One team card (72W-0 "Team Card" / "Team Card / No coach"). The whole card opens the team. */
function TeamCard({ item }: { item: TeamListItem }) {
  const coaches = coachLine(item);
  return (
    <Link
      className="flex min-w-0 flex-col gap-[18px] rounded-lg border border-line p-[22px] outline-none transition-colors hover:border-stone focus-visible:ring-2 focus-visible:ring-ink"
      params={{ teamId: item.team.id }}
      to="/admin/teams/$teamId"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="min-w-0 break-words font-display text-[48px] text-ink leading-12">
          {item.team.name}
        </h2>
        {item.sport ? (
          <span className="shrink-0 rounded-full bg-fog px-[10px] py-1 font-semibold text-[13px] text-ink leading-4">
            {item.sport}
          </span>
        ) : null}
      </div>
      <div className="flex gap-6">
        <CardStat
          label={item.studentCount === 1 ? "student" : "students"}
          value={String(item.studentCount)}
        />
        <CardStat label="attendance" value={attendanceLabel(item)} />
      </div>
      <p
        className={cn(
          "text-sm leading-[18px]",
          coaches ? "text-ink-soft" : "font-semibold text-orange-deep"
        )}
      >
        {coaches ?? noCoachLine(item)}
      </p>
    </Link>
  );
}

/**
 * "Place on a team": pick a team, then the team page opens with its add search
 * already filled, where the existing Add / Move here flow does the rest.
 */
function PlaceOnTeamMenu({
  teams,
  students,
  className,
  label = "Place on a team",
}: {
  teams: TeamListItem[];
  students: CoachCandidate[];
  className?: string;
  label?: string;
}) {
  const navigate = useNavigate();
  const search = students.length === 1 ? (students[0]?.user.name ?? "") : "";
  const handlePick = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { teamId } = event.currentTarget.dataset;
      if (teamId) {
        navigate({
          to: "/admin/teams/$teamId",
          params: { teamId },
          search: { add: search },
        });
      }
    },
    [navigate, search]
  );
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "w-fit cursor-pointer rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-2 outline-none [text-underline-position:from-font] focus-visible:ring-2 focus-visible:ring-ink",
          className
        )}
      >
        {label}
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuGroup>
          <DropdownMenuLabel>Choose a team</DropdownMenuLabel>
          {teams.map(({ team }) => (
            <DropdownMenuItem
              data-team-id={team.id}
              key={team.id}
              onClick={handlePick}
            >
              {team.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function withoutTeamSentence(students: CoachCandidate[]): string {
  const who = plural(students.length, "student", "students");
  return `${who} joined without a team: ${joinNames(students.map((s) => s.user.name))}.`;
}

/** Dashed "No team yet" card (72W-0 "No Team Card"). */
function NoTeamCard({
  teams,
  students,
}: {
  teams: TeamListItem[];
  students: CoachCandidate[];
}) {
  return (
    <section
      aria-labelledby="no-team-heading"
      className="flex min-w-0 flex-col justify-between gap-[18px] rounded-lg border-[#C4C4C0] border-[1.5px] border-dashed p-[22px] max-md:mt-6 max-md:rounded-md max-md:p-4"
    >
      <div className="flex flex-col gap-[6px]">
        <h2
          className="font-semibold text-ink text-lg leading-6 max-md:text-base max-md:leading-5"
          id="no-team-heading"
        >
          No team yet
        </h2>
        <p className="text-muted text-sm leading-5">
          {withoutTeamSentence(students)}
        </p>
      </div>
      <PlaceOnTeamMenu students={students} teams={teams} />
    </section>
  );
}

function TeamGrid({
  items,
  withoutTeam,
}: {
  items: TeamListItem[];
  withoutTeam: CoachCandidate[];
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,344px))] gap-5 max-md:hidden max-lg:grid-cols-2">
      {items.map((item) => (
        <TeamCard item={item} key={item.team.id} />
      ))}
      {withoutTeam.length > 0 ? (
        <NoTeamCard students={withoutTeam} teams={items} />
      ) : null}
    </div>
  );
}

const WHITESPACE = /\s+/;
const DIGITS = /\d+/;
const SHORT_NAME_MAX = 4;

/** Badge text: "U12" stays, "Girls U16" becomes "G16" (7PI-0). */
function teamBadge(name: string): string {
  const words = name.trim().split(WHITESPACE);
  if (words.length === 1 && name.length <= SHORT_NAME_MAX) {
    return name.toUpperCase();
  }
  const last = words.at(-1) ?? "";
  const digits = last.match(DIGITS)?.[0];
  const head = (digits ? words.slice(0, -1) : words)
    .map((word) => word.charAt(0).toUpperCase())
    .join("");
  return `${head}${digits ?? ""}`.slice(0, SHORT_NAME_MAX);
}

/** "Basketball · 16 students · Coach Sharika" / "… · 2 coaches" / "… · No coach". */
function phoneSummary(item: TeamListItem): string {
  let coaches = "No coach";
  if (item.coaches.length === 1) {
    coaches = `Coach ${firstName(item.coaches[0]?.name ?? "")}`;
  } else if (item.coaches.length > 1) {
    coaches = `${item.coaches.length} coaches`;
  }
  return [item.sport, plural(item.studentCount, "student", "students"), coaches]
    .filter(Boolean)
    .join(" · ");
}

function PhoneChevron() {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="16"
      viewBox="0 0 16 16"
      width="16"
    >
      <path
        d="M6 3l5 5-5 5"
        fill="none"
        stroke="#6B6B6B"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** "Eric Niyonzima joined on 20 Nov" / "Eric Niyonzima and Aline Uwase joined". */
function joinedLine(students: CoachCandidate[], timeZone: string): string {
  const [only] = students;
  if (students.length === 1 && only?.joinedAt) {
    return `${only.user.name} joined on ${formatDayMonth(only.joinedAt, timeZone)}`;
  }
  return `${joinNames(students.map((s) => s.user.name))} joined`;
}

/** Phone rows (7PI-0): badge, name, facts, attendance, chevron. */
function TeamsList({
  items,
  withoutTeam,
  timeZone,
}: {
  items: TeamListItem[];
  withoutTeam: CoachCandidate[];
  timeZone: string;
}) {
  return (
    <div className="flex flex-col gap-[18px] md:hidden">
      <ul className="flex flex-col">
        {items.map((item) => {
          const noCoach = item.coaches.length === 0;
          return (
            <li className="border-line border-b" key={item.team.id}>
              <Link
                className="flex items-center gap-[14px] py-[14px] outline-none focus-visible:ring-2 focus-visible:ring-ink"
                params={{ teamId: item.team.id }}
                to="/admin/teams/$teamId"
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "flex size-11 shrink-0 items-center justify-center rounded-[12px] font-display text-base leading-5",
                    noCoach ? "bg-orange text-ink" : "bg-ink text-white"
                  )}
                >
                  {teamBadge(item.team.name)}
                </span>
                <span className="flex min-w-0 shrink grow basis-0 flex-col gap-[2px]">
                  <span className="font-semibold text-[15px] text-ink leading-5">
                    {item.team.name}
                  </span>
                  <span
                    className={cn(
                      "text-[13px] leading-4",
                      noCoach ? "font-medium text-orange-deep" : "text-muted"
                    )}
                  >
                    {phoneSummary(item)}
                  </span>
                </span>
                <span
                  className={cn(
                    "w-11 shrink-0 text-right font-semibold text-sm leading-[18px]",
                    noCoach ? "text-orange-deep" : "text-ink"
                  )}
                >
                  {attendanceLabel(item)}
                  <span className="sr-only"> attendance this month</span>
                </span>
                <PhoneChevron />
              </Link>
            </li>
          );
        })}
      </ul>
      {withoutTeam.length > 0 ? (
        <section className="flex items-center gap-[14px] rounded-md border-[#D4D4D0] border-[1.5px] border-dashed px-4 py-[14px]">
          <div className="flex min-w-0 shrink grow basis-0 flex-col gap-[2px]">
            <h2 className="font-semibold text-[15px] text-ink leading-5">
              No team yet · {plural(withoutTeam.length, "student", "students")}
            </h2>
            <p className="text-[13px] text-muted leading-4">
              {joinedLine(withoutTeam, timeZone)}
            </p>
          </div>
          <PlaceOnTeamMenu
            className="shrink-0 rounded-full border border-ink px-[14px] py-2 no-underline"
            label="Place"
            students={withoutTeam}
            teams={items}
          />
        </section>
      ) : null}
    </div>
  );
}

function TeamsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,344px))] gap-5 max-md:hidden max-lg:grid-cols-2">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-[191px] rounded-lg" key={key} />
        ))}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-[60px] rounded-md" key={key} />
        ))}
      </div>
    </>
  );
}

function TeamsEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <Empty className="max-md:py-16">
      <EmptyMediaStack>
        <BasketballIcon />
      </EmptyMediaStack>
      <EmptyHeader>
        <EmptyTitle>No teams yet</EmptyTitle>
        <EmptyDescription>
          Teams decide which students each coach sees and who can check in to a
          session. Start with one, like U14 or Girls U16.
        </EmptyDescription>
      </EmptyHeader>
      <Button onClick={onCreate} size="lg">
        <PlusIcon />
        Create team
      </Button>
    </Empty>
  );
}

/** Teams, story AO-3: cards (72W-0), empty state (1UZ-0), phone rows (7PI-0). */
export function TeamsScreen({
  academyId,
  forceEmpty,
  onCreate,
}: {
  academyId: Id;
  /** Preview the empty state (`?empty=1`). */
  forceEmpty: boolean;
  onCreate: () => void;
}) {
  const { data } = useQuery(teamListQueryOptions(academyId));
  const timeZone = useActiveMembership()?.academy.timezone ?? "UTC";
  // Only the "students without a team" nudge: left out if it fails.
  const withoutTeam =
    useQuery({
      ...studentsWithoutTeamQueryOptions(academyId),
      throwOnError: false,
    }).data ?? [];
  const items = forceEmpty ? [] : data;
  const hasTeams = Boolean(items && items.length > 0);
  const studentTotal = items?.reduce((sum, t) => sum + t.studentCount, 0) ?? 0;
  return (
    <>
      <PageHeader>
        <PageHeading>
          <Eyebrow>
            {items && hasTeams
              ? `${plural(items.length, "team", "teams")} · ${plural(studentTotal, "student", "students")}`
              : "Organise your academy"}
          </Eyebrow>
          <PageTitle>Teams</PageTitle>
        </PageHeading>
        {hasTeams ? (
          <PageActions>
            <Button
              className="gap-[10px] px-[22px] py-3 leading-5 max-md:h-auto max-md:gap-[6px] max-md:px-4 max-md:py-[10px] max-md:text-sm max-md:leading-[18px]"
              onClick={onCreate}
            >
              <PlusIcon className="max-md:size-[14px]" />
              <span className="max-md:hidden">Create team</span>
              <span className="md:hidden">
                Team<span className="sr-only"> (create)</span>
              </span>
            </Button>
          </PageActions>
        ) : null}
      </PageHeader>
      {items ? null : <TeamsSkeleton />}
      {items && !hasTeams ? <TeamsEmpty onCreate={onCreate} /> : null}
      {items && hasTeams ? (
        <>
          <TeamGrid items={items} withoutTeam={withoutTeam} />
          <TeamsList
            items={items}
            timeZone={timeZone}
            withoutTeam={withoutTeam}
          />
        </>
      ) : null}
    </>
  );
}
