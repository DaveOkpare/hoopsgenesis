import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton, SkeletonList } from "@hoops-genesis/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hoops-genesis/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { useCallback } from "react";

import { formatWeekdayDayMonth } from "@/features/sessions/time";
import { AttendanceBar } from "@/features/team-detail/components/attendance";
import { ProfileLink } from "@/features/team-detail/components/profile-link";
import {
  type TeamDetail,
  teamDetailQueryOptions,
} from "@/features/team-detail/queries";
import type { DateOnly, Id, Team } from "@/features/types";
import { initials } from "@/lib/format";

const headClass = "py-3 font-medium tracking-label";
/** 4QT-0 shows four players; the team page has the rest. */
const SHOWN_ROWS = 4;
const NEEDS_QUOTES = /[",\n]/;

function csvCell(value: string): string {
  return NEEDS_QUOTES.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Download "U14 this month" as CSV (the Export button). */
function exportCsv(detail: TeamDetail, monthLabel: string) {
  const rows = [
    ["Player", "Attendance", "Last session", "Latest result"],
    ...detail.students.map((s) => [
      s.user.name,
      s.attendancePercent === null ? "" : `${s.attendancePercent}%`,
      s.lastSessionOn ? formatWeekdayDayMonth(s.lastSessionOn) : "",
      s.latestResult ?? "",
    ]),
  ];
  const csv = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${detail.team.name}-${monthLabel}.csv`
    .toLowerCase()
    .replaceAll(" ", "-");
  link.click();
  URL.revokeObjectURL(url);
}

/** Desktop: "U14 this month" (4QT-0). Hidden on phones, as in 3MZ-0. */
export function TeamMonthCard({
  academyId,
  teams,
  teamId,
  today,
  onTeamChange,
}: {
  academyId: Id;
  teams: Pick<Team, "id" | "name">[];
  teamId: Id;
  today: DateOnly;
  onTeamChange: (teamId: Id) => void;
}) {
  const { data: detail } = useQuery(
    teamDetailQueryOptions(academyId, teamId, today)
  );
  const teamName = teams.find((t) => t.id === teamId)?.name ?? "";
  const items = teams.map((t) => ({ value: t.id, label: t.name }));
  const handleValue = useCallback(
    (value: string | null) => {
      if (value) {
        onTeamChange(value);
      }
    },
    [onTeamChange]
  );
  const handleExport = useCallback(() => {
    if (detail) {
      exportCsv(detail, today.slice(0, 7));
    }
  }, [detail, today]);

  return (
    <section className="flex flex-col rounded-lg border border-line p-6 max-md:hidden">
      <div className="flex items-center justify-between gap-4 pb-4">
        <div className="flex flex-col gap-[2px]">
          <h2 className="font-semibold text-ink text-lg leading-6">
            {teamName} this month
          </h2>
          <p className="text-muted text-sm leading-[18px]">
            Attendance and latest verified result for each player
          </p>
        </div>
        <div className="flex gap-2">
          <Select items={items} onValueChange={handleValue} value={teamId}>
            <SelectTrigger aria-label="Team" variant="pill">
              <SelectValue />
            </SelectTrigger>
            <SelectContent align="end">
              {items.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            className="px-[14px] py-[9px] font-medium"
            disabled={!detail}
            onClick={handleExport}
            size="sm"
            variant="outline"
          >
            Export
          </Button>
        </div>
      </div>
      {/* Tablet (768 to 1023): two-line rows instead of the four-column table. */}
      {detail ? (
        <ul className="border-line border-t lg:hidden">
          {detail.students.slice(0, SHOWN_ROWS).map((student) => (
            <li
              className="flex items-center gap-[14px] border-line border-b py-[14px] last:border-b-0"
              key={student.user.id}
            >
              <Avatar size={36}>
                <AvatarFallback>{initials(student.user.name)}</AvatarFallback>
              </Avatar>
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <ProfileLink
                  className="w-fit truncate rounded-sm font-semibold text-[15px] text-ink leading-5 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink"
                  userId={student.user.id}
                  viewAs="coach"
                >
                  {student.user.name}
                </ProfileLink>
                <span className="truncate text-muted text-sm leading-[18px]">
                  {student.lastSessionOn
                    ? `Last ${formatWeekdayDayMonth(student.lastSessionOn)}`
                    : "No sessions yet"}{" "}
                  · {student.latestResult ?? "No results yet"}
                </span>
              </span>
              <span className="w-[160px] shrink-0">
                <AttendanceBar percent={student.attendancePercent} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <SkeletonList
          className="border-line border-t lg:hidden"
          label="Loading players"
          rows={4}
          trailing
        />
      )}
      <Table className="max-lg:hidden">
        <TableHeader className="border-t">
          <TableRow className="border-b-0">
            <TableHead className={headClass}>Player</TableHead>
            <TableHead className={`${headClass} w-[200px]`}>
              Attendance
            </TableHead>
            <TableHead className={`${headClass} w-40`}>Last session</TableHead>
            <TableHead className={`${headClass} w-[200px]`}>
              Latest result
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {detail
            ? detail.students.slice(0, SHOWN_ROWS).map((student) => (
                <TableRow className="last:border-b-0" key={student.user.id}>
                  <TableCell>
                    <ProfileLink
                      className="flex w-fit items-center gap-3 rounded-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ink"
                      userId={student.user.id}
                      viewAs="coach"
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
                    <AttendanceBar percent={student.attendancePercent} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.lastSessionOn
                      ? formatWeekdayDayMonth(student.lastSessionOn)
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.latestResult ?? "No results yet"}
                  </TableCell>
                </TableRow>
              ))
            : ["a", "b", "c", "d"].map((key) => (
                <TableRow key={key}>
                  <TableCell colSpan={4}>
                    <Skeleton className="h-8" />
                  </TableCell>
                </TableRow>
              ))}
        </TableBody>
      </Table>
      {detail && detail.students.length > SHOWN_ROWS ? (
        <div className="flex items-center justify-between gap-4 border-line border-t pt-4">
          <p className="text-muted text-sm leading-[18px]">
            Showing {SHOWN_ROWS} of {detail.students.length}
          </p>
          <Link
            className="rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
            params={{ teamId }}
            to="/coach/teams/$teamId"
          >
            Open {teamName}
          </Link>
        </div>
      ) : null}
    </section>
  );
}
