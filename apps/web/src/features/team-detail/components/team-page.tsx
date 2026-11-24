import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button, buttonVariants } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import {
  Eyebrow,
  PageActions,
  PageHeader,
  PageHeading,
  PageTitle,
} from "@hoops-genesis/ui/components/page-header";
import { SearchInput } from "@hoops-genesis/ui/components/search-input";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Table,
  TableActionsHead,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hoops-genesis/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { PlusIcon } from "@/components/icons";
import { AddMemberPanel } from "@/features/team-detail/components/add-member-panel";
import { AttendancePercent } from "@/features/team-detail/components/attendance";
import { ProfileLink } from "@/features/team-detail/components/profile-link";
import {
  ageLabel,
  paidToText,
  RowMenu,
  type TeamPageRole,
} from "@/features/team-detail/components/row-menu";
import {
  AdminCompactView,
  type AdminTeamSheet,
  CoachCompactView,
  type CoachTeamTab,
  RemoveList,
} from "@/features/team-detail/components/team-compact";
import {
  type TeamDetail,
  type TeamFeeStatus,
  teamDetailQueryOptions,
  useRemoveTeamMember,
} from "@/features/team-detail/queries";
import { useBelowLg } from "@/features/team-detail/use-below-lg";
import type { DateOnly, Id } from "@/features/types";
import { errorMessage } from "@/lib/api-client";
import { initials } from "@/lib/format";

export type { TeamPageRole } from "./row-menu";
export type { AdminTeamSheet, CoachTeamTab } from "./team-compact";

const COLLAPSED_ROWS = 4;
const SKELETON_ROWS = ["a", "b", "c", "d", "e"] as const;

function FeeCell({ fee }: { fee: TeamFeeStatus }) {
  if (fee.kind === "unpaid") {
    return (
      <span className="font-semibold text-orange-deep text-sm leading-[18px]">
        Not paid yet
      </span>
    );
  }
  if (fee.kind === "overdue") {
    return (
      <span className="inline-flex rounded-full bg-orange-soft px-[10px] py-[3px] font-semibold text-[13px] text-orange-deep leading-4">
        {fee.days} days overdue
      </span>
    );
  }
  return (
    <span className="text-muted text-sm leading-[18px]">
      {paidToText(fee.paidTo)}
    </span>
  );
}

function BackLink({ viewAs }: { viewAs: TeamPageRole }) {
  const className =
    "flex w-fit items-center gap-[6px] rounded-sm font-medium text-ink text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink";
  const chevron = (
    <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
      <path
        d="M10 3L5 8l5 5"
        fill="none"
        stroke="#111111"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
  return viewAs === "coach" ? (
    <Link className={className} to="/coach/teams">
      {chevron}
      My teams
    </Link>
  ) : (
    <Link className={className} to="/admin/teams">
      {chevron}
      Teams
    </Link>
  );
}

function CoachesCard({
  detail,
  viewerId,
  viewAs,
  academyId,
}: {
  detail: TeamDetail;
  viewerId: Id;
  viewAs: TeamPageRole;
  academyId: Id;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-lg bg-fog p-5">
      <h2 className="font-semibold text-base text-ink leading-5">Coaches</h2>
      {detail.coaches.length === 0 ? (
        <p className="text-muted text-sm leading-[18px]">No coach yet.</p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {detail.coaches.map((coach) => {
          const isViewer = coach.user.id === viewerId;
          return (
            <li className="flex items-center gap-3" key={coach.user.id}>
              <Avatar size={32} tone={isViewer ? "ink" : "white"}>
                <AvatarFallback>{initials(coach.user.name)}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-[15px] text-ink leading-5">
                {coach.user.name}
                {isViewer ? " (you)" : ""}
              </span>
            </li>
          );
        })}
      </ul>
      {viewAs === "coach" ? (
        <p className="text-[13px] text-muted leading-[18px]">
          Only the academy admin can add or remove coaches.
        </p>
      ) : (
        <AddMemberPanel
          academyId={academyId}
          className="border-line border-t pt-3"
          headingLevel="h3"
          memberRole="coach"
          team={detail.team}
          title={`Add a coach to ${detail.team.name}`}
        />
      )}
    </section>
  );
}

function TeamSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-7 max-lg:gap-5">
      <span className="sr-only">Loading team</span>
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-20 w-40 max-lg:h-[52px]" />
      <div className="flex gap-5 max-lg:hidden">
        <Skeleton className="h-96 flex-1 rounded-lg" />
        <Skeleton className="h-96 w-[380px] rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 lg:hidden">
        {SKELETON_ROWS.map((key) => (
          <Skeleton className="h-14 rounded-md" key={key} />
        ))}
      </div>
    </div>
  );
}

export interface TeamPageProps {
  academyId: Id;
  /** `?add=`: the add search, open below 1024px as a sheet. */
  addQuery?: string;
  onAddQueryChange: (query: string | undefined) => void;
  /** Admin sheets below 1024px (`?sheet=coaches|remove`). */
  onSheetChange?: (sheet: AdminTeamSheet | undefined) => void;
  /** Coach tabs below 1024px (`?tab=`). */
  onTabChange?: (tab: CoachTeamTab) => void;
  sheet?: AdminTeamSheet;
  tab?: CoachTeamTab;
  teamId: Id;
  today: DateOnly;
  viewAs: TeamPageRole;
  viewerId: Id;
}

/**
 * Team page, shared by /coach/teams/$teamId and /admin/teams/$teamId.
 * 1024px and up: 4YX-0 (table, add panel and coaches beside it).
 * Below 1024px: the phone designs, HAB-0 for coaches (Roster / Sessions / Results) and
 * 7S4-0 for admins; "Add student" opens a sheet.
 */
export function TeamPage(props: TeamPageProps) {
  const { academyId, teamId, today } = props;
  // A failure throws to the route's error screen: 404 shows "Page not found", 403
  // "No access", anything else "Try again".
  const query = useQuery(teamDetailQueryOptions(academyId, teamId, today));
  if (!query.data) {
    return <TeamSkeleton />;
  }
  return <TeamView {...props} detail={query.data} />;
}

function TeamView({
  academyId,
  detail,
  today,
  viewAs,
  viewerId,
  addQuery,
  onAddQueryChange,
  tab = "roster",
  onTabChange,
  sheet,
  onSheetChange,
}: TeamPageProps & { detail: TeamDetail }) {
  const { team } = detail;
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const compact = useBelowLg();
  const navigate = useNavigate();
  const remove = useRemoveTeamMember(academyId);
  const { mutate: removeMutate } = remove;
  const removingId = remove.isPending ? remove.variables?.userId : null;

  const needle = filter.trim().toLowerCase();
  const matching = needle
    ? detail.students.filter((s) => s.user.name.toLowerCase().includes(needle))
    : detail.students;
  const visible =
    needle || showAll ? matching : matching.slice(0, COLLAPSED_ROWS);
  const total = detail.students.length;
  const eyebrow = [
    detail.sport,
    ageLabel(team.ageGroup),
    `${total} ${total === 1 ? "student" : "students"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const handleFilter = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => setFilter(event.target.value),
    []
  );
  const toggleShowAll = useCallback(() => setShowAll((v) => !v), []);
  const handleAddStudent = useCallback(() => {
    if (compact) {
      onAddQueryChange("");
      return;
    }
    addInputRef.current?.focus();
  }, [compact, onAddQueryChange]);
  const handleAddSheetChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onAddQueryChange(undefined);
      }
    },
    [onAddQueryChange]
  );
  const handleOpenSheet = useCallback(
    (next: AdminTeamSheet) => onSheetChange?.(next),
    [onSheetChange]
  );
  const handleSheetChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onSheetChange?.(undefined);
      }
    },
    [onSheetChange]
  );
  const handleTab = useCallback(
    (next: CoachTeamTab) => onTabChange?.(next),
    [onTabChange]
  );
  const handleRemove = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { userId, name } = event.currentTarget.dataset;
      if (!userId) {
        return;
      }
      removeMutate(
        { teamId: team.id, userId },
        {
          onSuccess: () => toast.success(`${name} removed from ${team.name}`),
          onError: (error) =>
            toast.error(
              errorMessage(error, "Couldn't remove them. Try again.")
            ),
        }
      );
    },
    [removeMutate, team]
  );
  const handleLogResult = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { studentId } = event.currentTarget.dataset;
      navigate({ to: "/coach/results/new", search: { student: studentId } });
    },
    [navigate]
  );

  const footer =
    viewAs === "coach"
      ? `Showing ${visible.length} of ${total} · fees are read-only for coaches`
      : `Showing ${visible.length} of ${total}`;
  const canToggle = !needle && matching.length > COLLAPSED_ROWS;

  return (
    <>
      <div className="lg:hidden">
        {viewAs === "coach" ? (
          <CoachCompactView
            academyId={academyId}
            detail={detail}
            onAddStudent={handleAddStudent}
            onLogResult={handleLogResult}
            onRemove={handleRemove}
            onTabChange={handleTab}
            tab={tab}
            today={today}
          />
        ) : (
          <AdminCompactView
            detail={detail}
            onAddStudent={handleAddStudent}
            onOpenSheet={handleOpenSheet}
            today={today}
          />
        )}
      </div>

      <div className="flex flex-col gap-7 max-lg:hidden">
        <div className="flex flex-col gap-4">
          <BackLink viewAs={viewAs} />
          <PageHeader>
            <PageHeading>
              <Eyebrow>{eyebrow}</Eyebrow>
              <PageTitle className="text-display-md leading-[74px]">
                {team.name}
              </PageTitle>
            </PageHeading>
            <PageActions>
              <Button
                className="px-[22px] py-3 text-[15px] leading-5"
                onClick={handleAddStudent}
              >
                <PlusIcon />
                Add student
              </Button>
            </PageActions>
          </PageHeader>
        </div>

        <div className="flex items-start gap-5">
          <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-line p-6">
            <div className="flex items-center justify-between gap-4 pb-4">
              <h2 className="font-semibold text-ink text-lg leading-6">
                Students
              </h2>
              <SearchInput
                aria-label="Search the team"
                className="w-[220px] py-[9px]"
                onChange={handleFilter}
                placeholder="Search the team"
                value={filter}
              />
            </div>

            <Table>
              <TableHeader className="border-t">
                <TableRow className="border-b-0">
                  <TableHead className="py-3 font-medium tracking-label">
                    Student
                  </TableHead>
                  <TableHead className="w-[130px] py-3 font-medium tracking-label">
                    Attendance
                  </TableHead>
                  <TableHead className="w-40 py-3 font-medium tracking-label">
                    Fees
                  </TableHead>
                  <TableActionsHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((student) => (
                  <TableRow key={student.user.id}>
                    <TableCell>
                      <ProfileLink
                        className="flex w-fit items-center gap-3 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink"
                        userId={student.user.id}
                        viewAs={viewAs}
                      >
                        <Avatar size={32}>
                          <AvatarFallback>
                            {initials(student.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-[15px] text-ink leading-5">
                          {student.user.name}
                        </span>
                      </ProfileLink>
                    </TableCell>
                    <TableCell>
                      <AttendancePercent percent={student.attendancePercent} />
                    </TableCell>
                    <TableCell>
                      <FeeCell fee={student.fee} />
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="flex justify-end">
                        <RowMenu
                          onLogResult={handleLogResult}
                          onRemove={handleRemove}
                          student={student}
                          teamName={team.name}
                          viewAs={viewAs}
                        />
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {visible.length === 0 ? (
              <p className="py-6 text-center text-[15px] text-muted leading-5">
                {needle
                  ? `No one on ${team.name} matches “${filter.trim()}”.`
                  : "No students yet. Add someone who already joined the academy."}
              </p>
            ) : null}

            <div className="flex items-center justify-between gap-4 pt-4">
              <p className="text-muted text-sm leading-[18px]">{footer}</p>
              {canToggle ? (
                <Button
                  aria-expanded={showAll}
                  className="shrink-0"
                  onClick={toggleShowAll}
                  variant="link"
                >
                  {showAll ? "Show fewer" : "Show all"}
                </Button>
              ) : null}
            </div>
          </section>

          <div className="flex w-[380px] shrink-0 flex-col gap-5">
            {compact ? null : (
              <AddMemberPanel
                academyId={academyId}
                className="rounded-lg border border-line bg-white p-5 shadow-[0_12px_32px_#1111111F]"
                initialQuery={addQuery ?? ""}
                inputRef={addInputRef}
                team={team}
              />
            )}
            <CoachesCard
              academyId={academyId}
              detail={detail}
              viewAs={viewAs}
              viewerId={viewerId}
            />
          </div>
        </div>
      </div>

      <Dialog
        onOpenChange={handleAddSheetChange}
        open={compact && addQuery !== undefined}
      >
        <DialogContent>
          <DialogHeader className="sr-only">
            <DialogTitle>Add a student to {team.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="pt-5 pb-9">
            <AddMemberPanel
              academyId={academyId}
              initialQuery={addQuery ?? ""}
              team={team}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>

      {viewAs === "admin" ? (
        <AdminSheets
          academyId={academyId}
          detail={detail}
          onOpenChange={handleSheetChange}
          onRemove={handleRemove}
          pendingId={removingId ?? null}
          sheet={sheet}
          viewerId={viewerId}
        />
      ) : null}
    </>
  );
}

/** Admin sheets: "Edit coaches" and "Remove a student…" (7S4-0 ··· menu). */
function AdminSheets({
  academyId,
  detail,
  sheet,
  viewerId,
  pendingId,
  onOpenChange,
  onRemove,
}: {
  academyId: Id;
  detail: TeamDetail;
  sheet?: AdminTeamSheet;
  viewerId: Id;
  pendingId: Id | null;
  onOpenChange: (open: boolean) => void;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
}) {
  const { team } = detail;
  return (
    <>
      <Dialog onOpenChange={onOpenChange} open={sheet === "coaches"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Coaches of {team.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-5 pb-9">
            <CoachRemoveList
              detail={detail}
              onRemove={onRemove}
              pendingId={pendingId}
              viewerId={viewerId}
            />
            <AddMemberPanel
              academyId={academyId}
              className="border-line border-t pt-4"
              headingLevel="h3"
              memberRole="coach"
              team={team}
              title={`Add a coach to ${team.name}`}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog onOpenChange={onOpenChange} open={sheet === "remove"}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove a student from {team.name}</DialogTitle>
          </DialogHeader>
          <DialogBody className="gap-3 pb-9">
            <p className="text-muted text-sm leading-[18px]">
              They stay in the academy, with no team. Their past attendance
              stays with {team.name}.
            </p>
            <RemoveList
              detail={detail}
              onRemove={onRemove}
              pendingId={pendingId}
            />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The team's coaches with a Remove button each (admin "Edit coaches" sheet). */
function CoachRemoveList({
  detail,
  viewerId,
  pendingId,
  onRemove,
}: {
  detail: TeamDetail;
  viewerId: Id;
  pendingId: Id | null;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
}) {
  if (detail.coaches.length === 0) {
    return (
      <p className="font-semibold text-orange-deep text-sm leading-[18px]">
        No coach yet. Add one below.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {detail.coaches.map((coach) => (
        <li className="flex items-center gap-3" key={coach.user.id}>
          <Avatar size={32} tone={coach.user.id === viewerId ? "ink" : "fog"}>
            <AvatarFallback>{initials(coach.user.name)}</AvatarFallback>
          </Avatar>
          <span className="min-w-0 flex-1 truncate font-medium text-[15px] text-ink leading-5">
            {coach.user.name}
            {coach.user.id === viewerId ? " (you)" : ""}
          </span>
          <button
            className={buttonVariants({
              size: "xs",
              variant: "destructive-outline",
              className: "shrink-0 px-3",
            })}
            data-name={coach.user.name}
            data-user-id={coach.user.id}
            disabled={pendingId === coach.user.id}
            onClick={onRemove}
            type="button"
          >
            Remove<span className="sr-only"> {coach.user.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
