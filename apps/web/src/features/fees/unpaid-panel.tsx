import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import { FilterChip } from "@hoops-genesis/ui/components/chip";
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
import { type ReactNode, useCallback } from "react";

import { PaymentsSkeleton } from "@/features/fees/payments-panel";
import type { OutstandingRow, Owed } from "@/features/fees/queries";
import type { Id, Money, Team } from "@/features/types";
import { formatDayMonth, formatMoney, initials } from "@/lib/format";

/** Over a month late reads in bold on the phone design ("48 days overdue"). */
const LONG_OVERDUE_DAYS = 30;

export interface UnpaidGroup {
  label: string;
  rows: OutstandingRow[];
  teamId: Id | null;
  /** Known and estimated amounts owed (for sorting). */
  total: number;
}

/** Group by team; biggest groups first (U14 · 6, U16 · 4, …), most overdue first inside. */
export function groupUnpaid(rows: OutstandingRow[]): UnpaidGroup[] {
  const groups = new Map<string, UnpaidGroup>();
  for (const row of rows) {
    const key = row.teamId ?? "none";
    const group = groups.get(key) ?? {
      teamId: row.teamId,
      label: row.student.teamName ?? "No team",
      rows: [],
      total: 0,
    };
    group.rows.push(row);
    group.total += Number(row.owed?.amount ?? 0);
    groups.set(key, group);
  }
  const sorted = [...groups.values()].sort(
    (a, b) => b.rows.length - a.rows.length || b.total - a.total
  );
  for (const group of sorted) {
    group.rows.sort(
      (a, b) =>
        (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) ||
        (b.lastPaidAt ?? "").localeCompare(a.lastPaidAt ?? "")
    );
  }
  return sorted;
}

/** Chip label: "Girls U16" is "Girls" on the phone design. */
function chipLabel(team: Team): string {
  return team.name.startsWith("Girls") ? "Girls" : team.name;
}

/** "18 days overdue"; "Never paid" when the server can't tell (never paid, never billed). */
export function overdueLabel(days: number | null): string {
  if (days === null) {
    return "Never paid";
  }
  if (days === 0) {
    return "Due today";
  }
  return days === 1 ? "1 day overdue" : `${days} days overdue`;
}

const ESTIMATE_TITLE =
  "Estimated from their last payment: no fee was billed for this month.";

/** "RWF 30,000"; "≈ RWF 30,000" when estimated; "No amount set" when unknown. */
export function OwedAmount({ owed }: { owed: Owed | null }) {
  if (!owed) {
    return (
      <span
        className="font-normal text-muted"
        title="They have never paid and no fee was billed, so there is no amount yet."
      >
        No amount set
      </span>
    );
  }
  const money = formatMoney(owed);
  if (!owed.estimated) {
    return <>{money}</>;
  }
  return (
    <span title={ESTIMATE_TITLE}>
      <span aria-hidden="true">≈ </span>
      <span className="sr-only">About </span>
      {money}
    </span>
  );
}

function isLongOverdue(days: number | null): boolean {
  return days !== null && days > LONG_OVERDUE_DAYS;
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
                  isLongOverdue(row.daysOverdue) && "font-semibold",
                  row.daysOverdue === null && "text-muted"
                )}
              >
                {overdueLabel(row.daysOverdue)}
              </TableCell>
              <TableCell className="py-3 text-right font-medium text-ink">
                <OwedAmount owed={row.owed} />
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
                    isLongOverdue(row.daysOverdue) && "font-semibold",
                    row.daysOverdue === null && "text-muted"
                  )}
                >
                  {overdueLabel(row.daysOverdue)} ·{" "}
                  <OwedAmount owed={row.owed} />
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

/**
 * BPK-0 "Everyone has paid for November". Academy-wide it gives the month's totals; for
 * one team it says so for that team (the totals are academy-wide, so they're left out).
 */
export function EveryonePaid({
  month,
  nextMonth,
  nextStart,
  teamName,
  paidStudentCount,
  collected,
  onSeePayments,
}: {
  month: string;
  nextMonth: string;
  nextStart: string;
  teamName: string | null;
  paidStudentCount: number | null;
  collected: Money | null;
  onSeePayments: () => void;
}) {
  let detail = `${nextMonth} fees start on ${nextStart}.`;
  if (teamName) {
    detail = `No one in ${teamName} owes anything for ${month}. ${detail}`;
  } else if (paidStudentCount !== null && collected) {
    detail = `${paidStudentCount} students · ${formatMoney(collected)} collected. ${detail}`;
  }
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="mt-2 flex w-full flex-col items-center gap-3 rounded-lg bg-[#EAF6EF] px-6 py-9 text-center">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-success">
          <svg aria-hidden="true" height="26" viewBox="0 0 22 22" width="26">
            <path
              d="M5.5 11.5l3.8 3.8 7.2-8"
              fill="none"
              stroke="#FFFFFF"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.4"
            />
          </svg>
        </span>
        <p className="font-display text-[34px] text-ink uppercase leading-[34px]">
          {teamName
            ? `${teamName} has paid for ${month}`
            : `Everyone has paid for ${month}`}
        </p>
        <p className="max-w-[440px] text-[15px] text-ink-soft leading-[21px]">
          {detail}
        </p>
      </div>
      <button
        className="cursor-pointer rounded-sm font-semibold text-ink text-sm leading-[18px] underline decoration-1 underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ink"
        onClick={onSeePayments}
        type="button"
      >
        See {month} payments
      </button>
    </div>
  );
}

export function UnpaidPanel({
  groups,
  isLoading,
  timeZone,
  onRecord,
  everyonePaid,
}: {
  groups: UnpaidGroup[] | undefined;
  isLoading: boolean;
  timeZone: string;
  onRecord: (studentId: Id) => void;
  everyonePaid: ReactNode;
}) {
  if (isLoading || !groups) {
    return <PaymentsSkeleton />;
  }
  if (groups.length === 0) {
    return everyonePaid;
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
