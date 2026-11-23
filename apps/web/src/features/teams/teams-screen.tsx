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
  List,
  ListRow,
  ListRowChevron,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
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
}: {
  teams: TeamListItem[];
  students: CoachCandidate[];
  className?: string;
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
        Place on a team
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
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,344px))] gap-5 max-md:hidden">
      {items.map((item) => (
        <TeamCard item={item} key={item.team.id} />
      ))}
      {withoutTeam.length > 0 ? (
        <NoTeamCard students={withoutTeam} teams={items} />
      ) : null}
    </div>
  );
}

function phoneSummary(item: TeamListItem): string {
  return [
    item.sport,
    plural(item.studentCount, "student", "students"),
    item.attendancePercent === null
      ? null
      : `${item.attendancePercent}% attendance`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Below md there is no design: List rows carrying the same facts as the cards. */
function TeamsList({
  items,
  withoutTeam,
}: {
  items: TeamListItem[];
  withoutTeam: CoachCandidate[];
}) {
  return (
    <div className="md:hidden">
      <List>
        {items.map((item) => {
          const coaches = coachLine(item);
          return (
            <ListRow
              className="items-start"
              key={item.team.id}
              render={
                <Link
                  params={{ teamId: item.team.id }}
                  to="/admin/teams/$teamId"
                />
              }
            >
              <ListRowContent className="gap-1">
                <ListRowTitle className="font-display font-normal text-[28px] leading-[30px]">
                  {item.team.name}
                </ListRowTitle>
                <ListRowDescription className="text-ink">
                  {phoneSummary(item)}
                </ListRowDescription>
                <ListRowDescription
                  className={
                    coaches ? undefined : "font-semibold text-orange-deep"
                  }
                >
                  {coaches ?? noCoachLine(item)}
                </ListRowDescription>
              </ListRowContent>
              <ListRowChevron className="mt-2" />
            </ListRow>
          );
        })}
      </List>
      {withoutTeam.length > 0 ? (
        <NoTeamCard students={withoutTeam} teams={items} />
      ) : null}
    </div>
  );
}

function TeamsSkeleton() {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,344px))] gap-5 max-md:hidden">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-[191px] rounded-lg" key={key} />
        ))}
      </div>
      <div className="flex flex-col gap-3 md:hidden">
        {SKELETON_CARDS.map((key) => (
          <Skeleton className="h-20" key={key} />
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

/** Teams, story AO-3: cards (72W-0), empty state (1UZ-0), phone rows (no design). */
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
  const withoutTeam =
    useQuery(studentsWithoutTeamQueryOptions(academyId)).data ?? [];
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
              className="gap-[10px] px-[22px] py-3 leading-5 max-md:gap-2 max-md:px-4 max-md:py-[9px] max-md:text-sm max-md:leading-[18px]"
              onClick={onCreate}
            >
              <PlusIcon />
              Create team
            </Button>
          </PageActions>
        ) : null}
      </PageHeader>
      {items ? null : <TeamsSkeleton />}
      {items && !hasTeams ? <TeamsEmpty onCreate={onCreate} /> : null}
      {items && hasTeams ? (
        <>
          <TeamGrid items={items} withoutTeam={withoutTeam} />
          <TeamsList items={items} withoutTeam={withoutTeam} />
        </>
      ) : null}
    </>
  );
}
