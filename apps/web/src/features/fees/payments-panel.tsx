import { Button } from "@hoops-genesis/ui/components/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@hoops-genesis/ui/components/dropdown-menu";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@hoops-genesis/ui/components/empty";
import {
  List,
  ListRow,
  ListRowContent,
  ListRowDescription,
  ListRowTitle,
} from "@hoops-genesis/ui/components/list";
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
import { useCallback } from "react";

import { MoreIcon } from "@/components/icons";
import {
  methodLabel,
  periodKeyOf,
  periodLongLabel,
  periodShortLabel,
} from "@/features/fees/periods";
import type { PaymentRow } from "@/features/fees/queries";
import type { Id } from "@/features/types";
import { firstName, formatDayMonth, formatMoney } from "@/lib/format";

const FIRST_SENTENCE = /^[^.!?]+/;
const SKELETON_ROWS = ["a", "b", "c", "d", "e", "f"];

/** "Voided by you" / "Voided by Patrick". */
function voidedByLabel(row: PaymentRow, viewerId: Id): string {
  if (row.voidedBy === viewerId) {
    return "Voided by you";
  }
  return row.voidedByName
    ? `Voided by ${firstName(row.voidedByName)}`
    : "Voided";
}

/** Second line of the Method cell: reference, or who recorded a cash payment. */
function methodDetail(row: PaymentRow, viewerId: Id): string | null {
  if (row.paymentReference) {
    return `Ref ${row.paymentReference}`;
  }
  if (row.recordedBy === viewerId) {
    return "Recorded by you";
  }
  return row.recordedByName
    ? `Recorded by ${firstName(row.recordedByName)}`
    : null;
}

/** The short form of a void reason shown in the table: “Duplicate entry”. */
function shortReason(reason: string | null): string {
  const first = reason?.match(FIRST_SENTENCE)?.[0]?.trim();
  return first ? `“${first}”` : "";
}

const struck = "text-[#8A8A8A] line-through decoration-1";

function RowActions({
  row,
  onVoid,
}: {
  row: PaymentRow;
  onVoid: (feeId: Id) => void;
}) {
  const isVoided = row.voidedAt !== null;
  const handleVoid = useCallback(() => onVoid(row.id), [onVoid, row.id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${row.student.name}'s ${periodShortLabel(periodKeyOf(row.periodStart))} payment`}
            className="-mr-2 text-muted"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {isVoided ? (
          <DropdownMenuItem disabled>Already voided</DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={handleVoid} variant="destructive">
            Void payment…
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function PaymentsTable({
  rows,
  viewerId,
  timeZone,
  highlightId,
  onVoid,
}: {
  rows: PaymentRow[];
  viewerId: Id;
  timeZone: string;
  highlightId: Id | undefined;
  onVoid: (feeId: Id) => void;
}) {
  return (
    <Table className="table-fixed max-md:hidden">
      <TableHeader>
        <TableRow className="border-b-0">
          <TableHead>Student</TableHead>
          <TableHead className="w-[120px]">Period</TableHead>
          <TableHead className="w-[120px]">Paid on</TableHead>
          <TableHead className="w-[200px]">Method</TableHead>
          <TableHead className="w-[130px] text-right">Amount</TableHead>
          <TableActionsHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => {
          const isVoided = row.voidedAt !== null;
          const detail = methodDetail(row, viewerId);
          let state: string | undefined;
          if (isVoided) {
            state = "voided";
          } else if (row.id === highlightId) {
            state = "selected";
          }
          return (
            <TableRow data-state={state} key={row.id}>
              <TableCell className="py-[13px]">
                <div className="flex flex-col">
                  <span
                    className={cn(
                      "font-medium text-[15px] text-ink leading-[18px]",
                      isVoided && struck
                    )}
                  >
                    {row.student.name}
                  </span>
                  <span className="text-[13px] text-muted leading-4">
                    {row.student.teamName ?? "No team"}
                  </span>
                </div>
              </TableCell>
              <TableCell className={cn("py-[13px]", isVoided && struck)}>
                {periodShortLabel(periodKeyOf(row.periodStart))}
              </TableCell>
              <TableCell className={cn("py-[13px]", isVoided && struck)}>
                {row.paidAt ? formatDayMonth(row.paidAt, timeZone) : "—"}
              </TableCell>
              <TableCell className="py-[13px]">
                {isVoided ? (
                  <div className="flex flex-col">
                    <span className="font-semibold text-orange-deep text-sm leading-[18px]">
                      {voidedByLabel(row, viewerId)}
                    </span>
                    <span
                      className="truncate text-[13px] text-muted leading-4"
                      title={row.voidReason ?? undefined}
                    >
                      {shortReason(row.voidReason)}
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col">
                    <span>{methodLabel(row.paymentMethod)}</span>
                    {detail ? (
                      <span className="text-[13px] text-muted leading-4">
                        {detail}
                      </span>
                    ) : null}
                  </div>
                )}
              </TableCell>
              <TableCell
                className={cn(
                  "py-[13px] text-right font-medium text-ink",
                  isVoided && struck
                )}
              >
                {formatMoney({ amount: row.amount, currency: row.currency })}
              </TableCell>
              <TableCell className="py-[13px] text-right">
                <RowActions onVoid={onVoid} row={row} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

function PaymentsList({
  rows,
  viewerId,
  timeZone,
  highlightId,
}: {
  rows: PaymentRow[];
  viewerId: Id;
  timeZone: string;
  highlightId: Id | undefined;
}) {
  return (
    <List className="md:hidden">
      {rows.map((row) => {
        const isVoided = row.voidedAt !== null;
        const paidOn = row.paidAt ? formatDayMonth(row.paidAt, timeZone) : "—";
        return (
          <ListRow
            className={cn(
              row.id === highlightId && "-mx-2 rounded-sm bg-fog px-2"
            )}
            key={row.id}
          >
            <ListRowContent>
              <ListRowTitle className={cn(isVoided && struck)}>
                {row.student.name}
              </ListRowTitle>
              {isVoided ? (
                <ListRowDescription className="font-semibold text-orange-deep">
                  {voidedByLabel(row, viewerId)} · {paidOn}
                </ListRowDescription>
              ) : (
                <ListRowDescription>
                  {methodLabel(row.paymentMethod)} · {paidOn}
                  {row.student.teamName ? ` · ${row.student.teamName}` : ""}
                </ListRowDescription>
              )}
            </ListRowContent>
            <span
              className={cn(
                "shrink-0 font-semibold text-[15px] text-ink leading-5",
                isVoided && struck
              )}
            >
              {formatMoney({ amount: row.amount, currency: row.currency })}
            </span>
          </ListRow>
        );
      })}
    </List>
  );
}

export function PaymentsSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col" role="status">
      <span className="sr-only">Loading payments</span>
      {SKELETON_ROWS.map((key) => (
        <div
          className="flex items-center gap-6 border-line border-b py-[13px]"
          key={key}
        >
          <div className="flex flex-1 flex-col gap-1.5">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-12" />
          </div>
          <Skeleton className="h-4 w-20 max-md:hidden" />
          <Skeleton className="h-4 w-16 max-md:hidden" />
          <Skeleton className="h-4 w-28 max-md:hidden" />
          <Skeleton className="h-4 w-24" />
        </div>
      ))}
    </div>
  );
}

export function PaymentsPanel({
  rows,
  isLoading,
  query,
  period,
  viewerId,
  timeZone,
  highlightId,
  onVoid,
}: {
  rows: PaymentRow[] | undefined;
  isLoading: boolean;
  query: string;
  period: `${number}-${string}`;
  viewerId: Id;
  timeZone: string;
  highlightId: Id | undefined;
  onVoid: (feeId: Id) => void;
}) {
  if (isLoading || !rows) {
    return <PaymentsSkeleton />;
  }
  if (rows.length === 0) {
    return (
      <Empty className="py-10">
        <EmptyHeader>
          <EmptyTitle>
            {query ? "No matching payments" : "No payments yet"}
          </EmptyTitle>
          <EmptyDescription>
            {query
              ? `Nothing for “${query}” in ${periodLongLabel(period)}.`
              : `Payments for ${periodLongLabel(period)} show here once they're recorded.`}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }
  return (
    <>
      <PaymentsTable
        highlightId={highlightId}
        onVoid={onVoid}
        rows={rows}
        timeZone={timeZone}
        viewerId={viewerId}
      />
      <PaymentsList
        highlightId={highlightId}
        rows={rows}
        timeZone={timeZone}
        viewerId={viewerId}
      />
    </>
  );
}
