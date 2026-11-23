import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@hoops-genesis/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
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
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
  type ChangeEvent,
  type MouseEvent,
  useCallback,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useIsPhone } from "@/components/coach/use-is-phone";
import { MoreIcon, PlusIcon } from "@/components/icons";
import { AddMemberPanel } from "@/features/team-detail/components/add-member-panel";
import {
  AttendancePercent,
  isLowAttendance,
} from "@/features/team-detail/components/attendance";
import {
  type TeamDetail,
  type TeamFeeStatus,
  type TeamStudent,
  teamDetailQueryOptions,
  useRemoveTeamMember,
} from "@/features/team-detail/queries";
import type { DateOnly, Id } from "@/features/types";
import { formatDayMonth, initials } from "@/lib/format";

export type TeamPageRole = "coach" | "admin";

const COLLAPSED_ROWS = 4;

const AGE_GROUP = /^U(\d+)$/i;

function ageLabel(ageGroup: string | null): string | null {
  const match = ageGroup?.match(AGE_GROUP);
  return match ? `Under ${match[1]}` : ageGroup;
}

function FeeCell({ fee }: { fee: TeamFeeStatus }) {
  if (fee.kind === "overdue") {
    return (
      <span className="inline-flex rounded-full bg-orange-soft px-[10px] py-[3px] font-semibold text-[13px] text-orange-deep leading-4">
        {fee.days} days overdue
      </span>
    );
  }
  return (
    <span className="text-muted text-sm leading-[18px]">
      Paid to {formatDayMonth(fee.paidTo)}
    </span>
  );
}

function RowMenu({
  student,
  teamName,
  viewAs,
  onRemove,
  onLogResult,
}: {
  student: TeamStudent;
  teamName: string;
  viewAs: TeamPageRole;
  onRemove: (event: MouseEvent<HTMLElement>) => void;
  onLogResult: (event: MouseEvent<HTMLElement>) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label={`Actions for ${student.user.name}`}
        className="flex size-8 cursor-pointer items-center justify-center rounded-full text-muted outline-none hover:bg-fog focus-visible:ring-2 focus-visible:ring-ink aria-expanded:bg-fog"
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {viewAs === "coach" ? (
          <DropdownMenuItem
            data-student-id={student.user.id}
            onClick={onLogResult}
          >
            Log a result
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          data-member-id={student.memberId}
          data-name={student.user.name}
          onClick={onRemove}
          variant="destructive"
        >
          Remove from {teamName}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
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
            <li className="flex items-center gap-3" key={coach.memberId}>
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
    <div aria-busy="true" className="flex flex-col gap-7">
      <span className="sr-only">Loading team</span>
      <Skeleton className="h-4 w-72" />
      <Skeleton className="h-20 w-40" />
      <div className="flex gap-5">
        <Skeleton className="h-96 flex-1 rounded-lg" />
        <Skeleton className="h-96 w-[380px] rounded-lg max-md:hidden" />
      </div>
    </div>
  );
}

/**
 * Team page (4YX-0), shared by /coach/teams/$teamId and /admin/teams/$teamId.
 * Coach: add/move students on their team, fees read-only (CO-7, CO-10).
 * Admin: the same, plus adding coaches (AO-3).
 * Phone (no design): rows become a list and "Add student" opens a bottom sheet.
 */
export function TeamPage({
  academyId,
  teamId,
  today,
  viewAs,
  viewerId,
  addQuery,
  onAddQueryChange,
}: {
  academyId: Id;
  teamId: Id;
  today: DateOnly;
  viewAs: TeamPageRole;
  viewerId: Id;
  /** `?add=` — the add search, open on phones as a sheet. */
  addQuery?: string;
  onAddQueryChange: (query: string | undefined) => void;
}) {
  const query = useQuery(teamDetailQueryOptions(academyId, teamId, today));
  if (query.isError) {
    return (
      <div className="flex flex-col gap-3">
        <PageTitle>Team not found</PageTitle>
        <p className="text-[15px] text-muted leading-5">
          It may have been removed, or you are not on it.
        </p>
      </div>
    );
  }
  if (!query.data) {
    return <TeamSkeleton />;
  }
  return (
    <TeamView
      academyId={academyId}
      addQuery={addQuery}
      detail={query.data}
      onAddQueryChange={onAddQueryChange}
      viewAs={viewAs}
      viewerId={viewerId}
    />
  );
}

function TeamView({
  academyId,
  detail,
  viewAs,
  viewerId,
  addQuery,
  onAddQueryChange,
}: {
  academyId: Id;
  detail: TeamDetail;
  viewAs: TeamPageRole;
  viewerId: Id;
  addQuery?: string;
  onAddQueryChange: (query: string | undefined) => void;
}) {
  const { team } = detail;
  const [filter, setFilter] = useState("");
  const [showAll, setShowAll] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);
  const isPhone = useIsPhone();
  const navigate = useNavigate();
  const remove = useRemoveTeamMember(academyId);
  const { mutate: removeMutate } = remove;

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
    if (isPhone) {
      onAddQueryChange("");
      return;
    }
    addInputRef.current?.focus();
  }, [isPhone, onAddQueryChange]);
  const handleSheetChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onAddQueryChange(undefined);
      }
    },
    [onAddQueryChange]
  );
  const handleRemove = useCallback(
    (event: MouseEvent<HTMLElement>) => {
      const { memberId, name } = event.currentTarget.dataset;
      if (!memberId) {
        return;
      }
      removeMutate(
        { teamId: team.id, memberId },
        {
          onSuccess: () => toast.success(`${name} removed from ${team.name}`),
          onError: (error) => toast.error(error.message),
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
      <PageHeader className="max-md:flex-col max-md:items-stretch max-md:gap-4">
        <PageHeading>
          <Eyebrow>{eyebrow}</Eyebrow>
          <PageTitle className="text-display-md leading-[74px] max-md:text-[52px] max-md:leading-[50px]">
            {team.name}
          </PageTitle>
        </PageHeading>
        <PageActions>
          <Button
            className="px-[22px] py-3 text-[15px] leading-5 max-md:w-full max-md:py-[15px]"
            onClick={handleAddStudent}
          >
            <PlusIcon />
            Add student
          </Button>
        </PageActions>
      </PageHeader>

      <div className="flex items-start gap-5 max-md:flex-col max-md:items-stretch max-md:gap-6">
        <section className="flex min-w-0 flex-1 flex-col rounded-lg border border-line p-6 max-md:rounded-none max-md:border-0 max-md:p-0">
          <div className="flex items-center justify-between gap-4 pb-4 max-md:flex-col max-md:items-stretch max-md:gap-3 max-md:pb-2">
            <h2 className="font-semibold text-ink text-lg leading-6">
              Students
            </h2>
            <SearchInput
              aria-label="Search the team"
              className="w-[220px] py-[9px] max-md:w-full max-md:py-[10px]"
              onChange={handleFilter}
              placeholder="Search the team"
              value={filter}
            />
          </div>

          <div className="max-md:hidden">
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
                  <TableRow key={student.memberId}>
                    <TableCell>
                      <span className="flex items-center gap-3">
                        <Avatar size={32}>
                          <AvatarFallback>
                            {initials(student.user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="font-medium text-[15px] text-ink leading-5">
                          {student.user.name}
                        </span>
                      </span>
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
          </div>

          <ul className="flex flex-col md:hidden">
            {visible.map((student) => (
              <li
                className="flex items-center gap-3 border-line border-b py-3"
                key={student.memberId}
              >
                <Avatar size={36}>
                  <AvatarFallback>{initials(student.user.name)}</AvatarFallback>
                </Avatar>
                <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
                  <p className="truncate font-semibold text-[15px] text-ink leading-5">
                    {student.user.name}
                  </p>
                  <p className="text-[13px] text-muted leading-4">
                    <span
                      className={cn(
                        isLowAttendance(student.attendancePercent) &&
                          "font-semibold text-orange-deep"
                      )}
                    >
                      {student.attendancePercent}% attendance
                    </span>
                    {" · "}
                    {student.fee.kind === "overdue" ? (
                      <span className="font-semibold text-orange-deep">
                        Fees {student.fee.days} days overdue
                      </span>
                    ) : (
                      `Paid to ${formatDayMonth(student.fee.paidTo)}`
                    )}
                  </p>
                </div>
                <RowMenu
                  onLogResult={handleLogResult}
                  onRemove={handleRemove}
                  student={student}
                  teamName={team.name}
                  viewAs={viewAs}
                />
              </li>
            ))}
          </ul>

          {visible.length === 0 ? (
            <p className="py-6 text-center text-[15px] text-muted leading-5">
              {needle
                ? `No one on ${team.name} matches “${filter.trim()}”.`
                : "No students yet."}
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

        <div className="flex w-[380px] shrink-0 flex-col gap-5 max-md:w-full max-lg:w-[320px]">
          <AddMemberPanel
            academyId={academyId}
            className="rounded-lg border border-line bg-white p-5 shadow-[0_12px_32px_#1111111F] max-md:hidden"
            initialQuery={isPhone ? "" : (addQuery ?? "")}
            inputRef={addInputRef}
            team={team}
          />
          <CoachesCard
            academyId={academyId}
            detail={detail}
            viewAs={viewAs}
            viewerId={viewerId}
          />
        </div>
      </div>

      <Dialog
        onOpenChange={handleSheetChange}
        open={isPhone && addQuery !== undefined}
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
    </>
  );
}
