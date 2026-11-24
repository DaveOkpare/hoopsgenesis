import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Badge } from "@hoops-genesis/ui/components/badge";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Card,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@hoops-genesis/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@hoops-genesis/ui/components/select";
import { SkeletonList } from "@hoops-genesis/ui/components/skeleton";
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
import { useCallback, useState } from "react";

import { MoreIcon } from "@/components/icons";
import {
  calendarDaysBetween,
  dayShortMonth,
  monthAndDay,
  monthName,
} from "@/features/dashboard/format";
import {
  dashboardTeamsQueryOptions,
  type UnpaidStudent,
  unpaidStudentsQueryOptions,
} from "@/features/dashboard/queries";
import type { Id } from "@/features/types";
import { formatMoney, initials } from "@/lib/format";

const ALL_TEAMS = "all";
/** Past a month overdue the badge turns strong orange. */
const DANGER_AFTER_DAYS = 30;

function OverdueBadge({
  row,
  now,
  timeZone,
}: {
  row: UnpaidStudent;
  now: Date;
  timeZone?: string;
}) {
  if (!row.lastPaidAt && row.joinedAt) {
    return <Badge>Joined {dayShortMonth(row.joinedAt, timeZone)}</Badge>;
  }
  if (!row.dueDate) {
    return <Badge>Never paid</Badge>;
  }
  const days = calendarDaysBetween(row.dueDate, now, timeZone);
  return (
    <Badge variant={days > DANGER_AFTER_DAYS ? "danger" : "warning"}>
      {days} {days === 1 ? "day" : "days"}
    </Badge>
  );
}

function toCsv(rows: UnpaidStudent[], timeZone?: string): string {
  const header = ["Student", "Team", "Last payment", "Due date", "Amount"];
  const lines = rows.map((row) =>
    [
      row.studentName,
      row.teamName ?? "",
      row.lastPaidAt ? monthAndDay(row.lastPaidAt, timeZone) : "Never paid",
      row.dueDate ?? "",
      row.amount ? formatMoney(row.amount) : "",
    ]
      .map((cell) => `"${cell.replaceAll('"', '""')}"`)
      .join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

function UnpaidRows({
  data,
  now,
  timeZone,
}: {
  data: { data: UnpaidStudent[]; total: number };
  now: Date;
  timeZone?: string;
}) {
  const navigate = useNavigate();
  const recordPayment = useCallback(
    () => navigate({ to: "/admin/fees", search: { record: 1 } }),
    [navigate]
  );
  return (
    <>
      {/* Tablet (768 to 1023, 8BW-0): two-line rows instead of the five-column table. */}
      <ul className="border-line border-t lg:hidden">
        {data.data.length === 0 ? (
          <li className="py-[14px] text-muted text-sm">
            Everyone on this team has paid.
          </li>
        ) : null}
        {data.data.map((row) => (
          <li
            className="flex items-center gap-[14px] border-line border-b py-[14px]"
            key={row.studentId}
          >
            <Avatar size={36}>
              <AvatarFallback>{initials(row.studentName)}</AvatarFallback>
            </Avatar>
            <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <span className="truncate font-semibold text-[15px] text-ink leading-5">
                {row.studentName}
              </span>
              <span className="truncate text-muted text-sm leading-[18px]">
                {row.teamName ?? "No team"} ·{" "}
                {row.lastPaidAt
                  ? `Last paid ${monthAndDay(row.lastPaidAt, timeZone)}`
                  : "Never paid"}
              </span>
            </span>
            <span className="flex w-[110px] shrink-0 justify-end">
              <OverdueBadge now={now} row={row} timeZone={timeZone} />
            </span>
            <span className="w-[100px] shrink-0 text-right font-semibold text-[15px] text-ink leading-5">
              {row.amount ? formatMoney(row.amount) : "—"}
            </span>
          </li>
        ))}
      </ul>
      <Table className="max-lg:hidden">
        <TableHeader className="border-t">
          <TableRow className="border-b-0">
            <TableHead>Student</TableHead>
            <TableHead className="w-[140px]">Team</TableHead>
            <TableHead className="w-[180px]">Last payment</TableHead>
            <TableHead className="w-[150px]">Overdue</TableHead>
            <TableHead className="w-[140px] text-right">Amount</TableHead>
            <TableActionsHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.data.length === 0 ? (
            <TableRow className="last:border-b-0">
              <TableCell className="text-muted" colSpan={6}>
                Everyone on this team has paid.
              </TableCell>
            </TableRow>
          ) : null}
          {data.data.map((row) => (
            <TableRow className="last:border-b-0" key={row.studentId}>
              <TableCell>
                <span className="flex items-center gap-3">
                  <Avatar size={32}>
                    <AvatarFallback>{initials(row.studentName)}</AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-ink">
                    {row.studentName}
                  </span>
                </span>
              </TableCell>
              <TableCell>{row.teamName ?? "No team"}</TableCell>
              <TableCell>
                {row.lastPaidAt
                  ? monthAndDay(row.lastPaidAt, timeZone)
                  : "Never paid"}
              </TableCell>
              <TableCell>
                <OverdueBadge now={now} row={row} timeZone={timeZone} />
              </TableCell>
              <TableCell className="text-right font-medium text-ink">
                {row.amount ? formatMoney(row.amount) : "—"}
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label={`Actions for ${row.studentName}`}
                    render={
                      <Button
                        className="-my-2 -mr-2 text-muted"
                        size="icon"
                        variant="ghost"
                      />
                    }
                  >
                    <MoreIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={recordPayment}>
                      Record payment
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <CardFooter className="pb-4">
        <span>
          Showing {data.data.length} of {data.total}
        </span>
        <Link
          className="font-semibold text-ink underline decoration-1 underline-offset-[3px] outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
          search={{ tab: "unpaid" }}
          to="/admin/fees"
        >
          View all unpaid
        </Link>
      </CardFooter>
    </>
  );
}

/** "Unpaid for November" card (desktop YA-0, story AO-5): filter by team, export. */
export function UnpaidCard({
  academyId,
  periodStart,
  now,
  timeZone,
}: {
  academyId: Id;
  periodStart: string;
  now: Date;
  timeZone?: string;
}) {
  const [team, setTeam] = useState<string>(ALL_TEAMS);
  const teams = useQuery(dashboardTeamsQueryOptions(academyId)).data ?? [];
  const teamId = team === ALL_TEAMS ? null : team;
  const unpaid = useQuery(unpaidStudentsQueryOptions(academyId, teamId)).data;
  const items = [
    { value: ALL_TEAMS, label: "All teams" },
    ...teams.map((t) => ({ value: t.id, label: t.name })),
  ];
  const handleTeam = useCallback((value: string | null) => {
    setTeam(value ?? ALL_TEAMS);
  }, []);
  const exportCsv = useCallback(() => {
    const blob = new Blob([toCsv(unpaid?.data ?? [], timeZone)], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `unpaid-${periodStart.slice(0, 7)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [unpaid, timeZone, periodStart]);

  return (
    <Card className="pb-2 max-md:hidden">
      <CardHeader className="pb-4">
        <div className="flex flex-col gap-[2px]">
          <CardTitle>Unpaid for {monthName(periodStart, timeZone)}</CardTitle>
          <CardDescription>
            Students with no payment covering today
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Select items={items} onValueChange={handleTeam} value={team}>
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
          <Button onClick={exportCsv} size="toolbar" variant="outline">
            Export
          </Button>
        </div>
      </CardHeader>
      {unpaid ? (
        <UnpaidRows data={unpaid} now={now} timeZone={timeZone} />
      ) : (
        <SkeletonList
          className="border-line border-t"
          label="Loading unpaid students"
          rows={4}
          trailing
        />
      )}
    </Card>
  );
}
