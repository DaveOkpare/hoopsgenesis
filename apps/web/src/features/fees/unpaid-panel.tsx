import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import {
  List,
  ListLabel,
  ListRow,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@hoops-genesis/ui/components/table";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useCallback } from "react";

import { PaymentsSkeleton } from "@/features/fees/payments-panel";
import { daysSince } from "@/features/fees/periods";
import type { OutstandingRow } from "@/features/fees/queries";
import type { Id, Team } from "@/features/types";
import { formatDayMonth, formatMoney, initials } from "@/lib/format";

/** Over a month late reads in bold on the phone design ("48 days overdue"). */
const LONG_OVERDUE_DAYS = 30;

export interface UnpaidGroup {
  label: string;
  rows: (OutstandingRow & { daysOverdue: number })[];
  teamId: Id | null;
  total: number;
}

/** Group by team; biggest groups first (U14 · 6, U16 · 4, …), most overdue first inside. */
export function groupUnpaid(
  rows: OutstandingRow[],
  now: Date,
  timeZone: string
): UnpaidGroup[] {
  const groups = new Map<string, UnpaidGroup>();
  for (const row of rows) {
    const key = row.teamId ?? "none";
    const group = groups.get(key) ?? {
      teamId: row.teamId,
      label: row.student.teamName ?? "No team",
      rows: [],
      total: 0,
    };
    group.rows.push({
      ...row,
      daysOverdue: Math.max(0, daysSince(row.dueDate, now, timeZone)),
    });
    group.total += Number(row.amount);
    groups.set(key, group);
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.rows.length - a.rows.length || b.total - a.total
  );
  for (const group of sorted) {
    group.rows.sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (b.lastPaidAt ?? "").localeCompare(a.lastPaidAt ?? "")
    );
  }
  return sorted;
}

/** Chip label: "Girls U16" is "Girls" on the phone design. */
function chipLabel(team: Team): string {
  return team.name.startsWith("Girls") ? "Girls" : team.name;
}

function overdueLabel(days: number): string {
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

function RecordButton({
  studentId,
  name,
  onRecord,
  className,
}: {
  studentId: Id;
  name: string;
  onRecord: (studentId: Id) => void;
  className?: string;
}) {
  const handleClick = useCallback(
    () => onRecord(studentId),
    [onRecord, studentId]
  );
  return (
    <Button
      aria-label={`Record a payment for ${name}`}
      className={cn("border-ink", className)}
      onClick={handleClick}
      size="sm"
      variant="outline"
    >
      Record
    </Button>
  );
}

function TeamChip({
  team,
  count,
  selected,
  onSelect,
}: {
  team: Team | null;
  count: number | null;
  selected: boolean;
  onSelect: (teamId: Id | null) => void;
}) {
  const handleClick = useCallback(
    () => onSelect(team?.id ?? null),
    [onSelect, team]
  );
  const label = team ? chipLabel(team) : "All";
  const text = count ? `${label} · ${count}` : label;
  return (
    <FilterChip
      className="px-[13px] py-[7px]"
      onClick={handleClick}
      selected={selected}
      size="sm"
    >
      {text}
    </FilterChip>
  );
}

export function TeamChips({
  teams,
  counts,
  teamId,
  onTeamChange,
}: {
  teams: Team[];
  counts: Map<Id | null, number>;
  teamId: Id | null;
  onTeamChange: (teamId: Id | null) => void;
}) {
  return (
    <fieldset className="-mx-5 flex min-w-0 gap-2 overflow-x-auto px-5 md:hidden">
      <legend className="sr-only">Filter by team</legend>
      <TeamChip
        count={null}
        onSelect={onTeamChange}
        selected={teamId === null}
        team={null}
      />
      {teams.map((team) => (
        <TeamChip
          count={counts.get(team.id) ?? null}
          key={team.id}
          onSelect={onTeamChange}
          selected={teamId === team.id}
          team={team}
        />
      ))}
    </fieldset>
  );
}

function UnpaidTable({
  groups,
  timeZone,
  onRecord,
}: {
  groups: UnpaidGroup[];
  timeZone: string;
  onRecord: (studentId: Id) => void;
}) {
  return (
    <Table className="table-fixed max-md:hidden">
      <TableHeader>
        <TableRow className="border-b-0">
          <TableHead>Student</TableHead>
          <TableHead className="w-[160px]">Last payment</TableHead>
          <TableHead className="w-[160px]">Overdue</TableHead>
          <TableHead className="w-[130px] text-right">Amount</TableHead>
          <TableHead className="w-[120px]">
            <span className="sr-only">Actions</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      {groups.map((group) => (
        <TableBody key={group.teamId ?? "none"}>
          <TableRow className="border-b-0">
            <th
              className="pt-6 pb-1 text-left font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
              colSpan={5}
              scope="colgroup"
            >
              {group.label} · {group.rows.length} unpaid
            </th>
          </TableRow>
          {group.rows.map((row) => (
            <TableRow key={row.studentId}>
              <TableCell className="py-3">
                <div className="flex items-center gap-3">
                  <Avatar size={32}>
                    <AvatarFallback>
                      {initials(row.student.name)}
                    </AvatarFallback>
                  </Avatar>
                  <span className="font-medium text-[15px] text-ink leading-[18px]">
                    {row.student.name}
                  </span>
                </div>
              </TableCell>
              <TableCell className="py-3">
                {row.lastPaidAt
                  ? formatDayMonth(row.lastPaidAt, timeZone)
                  : "Never"}
              </TableCell>
              <TableCell
                className={cn(
                  "py-3 text-orange-deep",
                  row.daysOverdue > LONG_OVERDUE_DAYS && "font-semibold"
                )}
              >
                {overdueLabel(row.daysOverdue)}
              </TableCell>
              <TableCell className="py-3 text-right font-medium text-ink">
                {formatMoney({ amount: row.amount, currency: row.currency })}
              </TableCell>
              <TableCell className="py-3 text-right">
                <RecordButton
                  name={row.student.name}
                  onRecord={onRecord}
                  studentId={row.studentId}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      ))}
    </Table>
  );
}

function UnpaidList({
  groups,
  onRecord,
}: {
  groups: UnpaidGroup[];
  onRecord: (studentId: Id) => void;
}) {
  return (
    <div className="flex flex-col gap-4 md:hidden">
      {groups.map((group) => (
        <List key={group.teamId ?? "none"}>
          <ListLabel>
            {group.label} · {group.rows.length} unpaid
          </ListLabel>
          {group.rows.map((row) => (
            <ListRow className="last:border-b" key={row.studentId}>
              <Avatar size={36}>
                <AvatarFallback className="text-[12px]">
                  {initials(row.student.name)}
                </AvatarFallback>
              </Avatar>
              <ListRowContent>
                <ListRowTitle>{row.student.name}</ListRowTitle>
                <ListRowDescription
                  className={cn(
                    "text-orange-deep",
                    row.daysOverdue > LONG_OVERDUE_DAYS && "font-semibold"
                  )}
                >
                  {overdueLabel(row.daysOverdue)} ·{" "}
                  {formatMoney({ amount: row.amount, currency: row.currency })}
                </ListRowDescription>
              </ListRowContent>
              <RecordButton
                className="px-[14px] py-2"
                name={row.student.name}
                onRecord={onRecord}
                studentId={row.studentId}
              />
            </ListRow>
          ))}
        </List>
      ))}
    </div>
  );
}

export function UnpaidPanel({
  groups,
  isLoading,
  timeZone,
  onRecord,
}: {
  groups: UnpaidGroup[] | undefined;
  isLoading: boolean;
  timeZone: string;
  onRecord: (studentId: Id) => void;
}) {
  if (isLoading || !groups) {
    return <PaymentsSkeleton />;
  }
  if (groups.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>Everyone has paid</EmptyTitle>
          <EmptyDescription>
            No student in this list owes anything for this month.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <UnpaidTable groups={groups} onRecord={onRecord} timeZone={timeZone} />
      <UnpaidList groups={groups} onRecord={onRecord} />
      <p className="text-[13px] text-muted leading-[18px] md:hidden">
        Export the full list from the web.
      </p>
    </>
  );
}
