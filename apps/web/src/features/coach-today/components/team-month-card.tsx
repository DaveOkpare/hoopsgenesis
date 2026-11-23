import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hoops-genesis/ui/components/table";
import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

import { formatResult } from "@/features/results/templates";
import { formatWeekdayDayMonth } from "@/features/sessions/time";
import { AttendanceBar } from "@/features/team-detail/components/attendance";
import {
  type TeamDetail,
  teamDetailQueryOptions,
} from "@/features/team-detail/queries";
import type { DateOnly, Id, Team } from "@/features/types";
import { initials } from "@/lib/format";

const headClass = "py-3 font-medium tracking-label";
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
      `${s.attendancePercent}%`,
      formatWeekdayDayMonth(s.lastSessionOn),
      s.latestResult ? formatResult(s.latestResult) : "",
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
      <Table>
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
            ? detail.students.map((student) => (
                <TableRow className="last:border-b-0" key={student.memberId}>
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
                    <AttendanceBar percent={student.attendancePercent} />
                  </TableCell>
                  <TableCell className="text-sm">
                    {formatWeekdayDayMonth(student.lastSessionOn)}
                  </TableCell>
                  <TableCell className="text-sm">
                    {student.latestResult
                      ? formatResult(student.latestResult)
                      : "No results yet"}
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
    </section>
  );
}
