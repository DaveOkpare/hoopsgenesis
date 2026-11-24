/*
 * The Payments tab: a table from 1024px (1KN-0), stacked rows on tablets (AGV-0) and a
 * list on phones (5TZ-0 style). Selecting a payment opens its detail (`?fee=`); the
 * table pages 25 at a time (`?page=`).
 */
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
export const PAGE_SIZE = 25;

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

function rowState(row: PaymentRow, highlightId: Id | undefined) {
  if (row.voidedAt !== null) {
    return "voided";
  }
  return row.id === highlightId ? "selected" : undefined;
}

/** The student's name as a button that opens the payment; it covers the whole row. */
function OpenButton({
  row,
  onOpen,
  className,
}: {
  row: PaymentRow;
  onOpen: (feeId: Id) => void;
  className?: string;
}) {
  const handleClick = useCallback(() => onOpen(row.id), [onOpen, row.id]);
  return (
    <button
      aria-label={`${row.student.name}, ${periodShortLabel(periodKeyOf(row.periodStart))} payment: details`}
      className={cn(
        "cursor-pointer text-left outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-ink focus-visible:after:ring-inset",
        className
      )}
      onClick={handleClick}
      type="button"
    >
      {row.student.name}
    </button>
  );
}

function RowActions({
  row,
  onVoid,
  onOpen,
}: {
  row: PaymentRow;
  onVoid: (feeId: Id) => void;
  onOpen: (feeId: Id) => void;
}) {
  const isVoided = row.voidedAt !== null;
  const handleVoid = useCallback(() => onVoid(row.id), [onVoid, row.id]);
  const handleOpen = useCallback(() => onOpen(row.id), [onOpen, row.id]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            aria-label={`Actions for ${row.student.name}'s ${periodShortLabel(periodKeyOf(row.periodStart))} payment`}
            className="relative z-10 -mr-2 text-muted"
            size="icon-sm"
            variant="ghost"
          />
        }
      >
        <MoreIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={handleOpen}>View payment</DropdownMenuItem>
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

function MethodCell({ row, viewerId }: { row: PaymentRow; viewerId: Id }) {
  if (row.voidedAt !== null) {
    return (
      <div className="flex min-w-0 flex-col gap-[2px]">
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
    );
  }
  const detail = methodDetail(row, viewerId);
  return (
    <div className="flex min-w-0 flex-col gap-[2px]">
      <span>{methodLabel(row.paymentMethod)}</span>
      {detail ? (
        <span className="truncate text-[13px] text-muted leading-4">
          {detail}
        </span>
      ) : null}
    </div>
  );
}

interface RowsProps {
  highlightId: Id | undefined;
  onOpen: (feeId: Id) => void;
  onVoid: (feeId: Id) => void;
  rows: PaymentRow[];
  timeZone: string;
  viewerId: Id;
}

function PaymentsTable({
  rows,
  viewerId,
  timeZone,
  highlightId,
  onVoid,
  onOpen,
}: RowsProps) {
  return (
    <Table className="table-fixed max-lg:hidden">
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
          return (
            <TableRow
              className="relative hover:bg-fog/60"
              data-state={rowState(row, highlightId)}
              key={row.id}
            >
              <TableCell className="py-[13px]">
                <div className="flex flex-col">
                  <OpenButton
                    className={cn(
                      "font-medium text-[15px] text-ink leading-[18px]",
                      isVoided && struck
                    )}
                    onOpen={onOpen}
                    row={row}
                  />
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
                <MethodCell row={row} viewerId={viewerId} />
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
                <RowActions onOpen={onOpen} onVoid={onVoid} row={row} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** AGV-0: one stacked row per payment (768 to 1023px). */
function PaymentsTabletRows({
  rows,
  viewerId,
  timeZone,
  highlightId,
  onVoid,
  onOpen,
}: RowsProps) {
  return (
    <ul aria-label="Payments" className="hidden flex-col md:max-lg:flex">
      {rows.map((row) => {
        const isVoided = row.voidedAt !== null;
        const paid = row.paidAt
          ? ` · Paid ${formatDayMonth(row.paidAt, timeZone)}`
          : "";
        return (
          <li
            className={cn(
              "relative flex items-center gap-4 border-line border-b py-[14px] text-ink text-sm leading-[18px]",
              isVoided && "bg-[#FAFAF8]",
              row.id === highlightId && "bg-fog"
            )}
            key={row.id}
          >
            <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
              <OpenButton
                className={cn(
                  "font-semibold text-[15px] text-ink leading-5",
                  isVoided && "text-[#9A9A9A] line-through decoration-1"
                )}
                onOpen={onOpen}
                row={row}
              />
              <span className="truncate text-muted text-sm leading-[18px]">
                {row.student.teamName ?? "No team"} ·{" "}
                {periodShortLabel(periodKeyOf(row.periodStart))}
                {paid}
              </span>
            </div>
            <div className="w-[200px] shrink-0">
              <MethodCell row={row} viewerId={viewerId} />
            </div>
            <span
              className={cn(
                "w-[100px] shrink-0 text-right font-semibold text-[15px] text-ink leading-5",
                isVoided && "text-[#9A9A9A] line-through decoration-1"
              )}
            >
              {formatMoney({ amount: row.amount, currency: row.currency })}
            </span>
            <div className="flex size-11 shrink-0 items-center justify-center">
              <RowActions onOpen={onOpen} onVoid={onVoid} row={row} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function PhoneRow({
  row,
  viewerId,
  timeZone,
  highlighted,
  onOpen,
}: {
  row: PaymentRow;
  viewerId: Id;
  timeZone: string;
  highlighted: boolean;
  onOpen: (feeId: Id) => void;
}) {
  const isVoided = row.voidedAt !== null;
  const paidOn = row.paidAt ? formatDayMonth(row.paidAt, timeZone) : "—";
  const handleClick = useCallback(() => onOpen(row.id), [onOpen, row.id]);
  return (
    <ListRow
      className={cn(highlighted && "-mx-2 rounded-sm bg-fog px-2")}
      render={<button onClick={handleClick} type="button" />}
    >
      <ListRowContent className="text-left">
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
}

function PaymentsList({
  rows,
  viewerId,
  timeZone,
  highlightId,
  onOpen,
}: Omit<RowsProps, "onVoid">) {
  return (
    <List className="md:hidden">
      {rows.map((row) => (
        <PhoneRow
          highlighted={row.id === highlightId}
          key={row.id}
          onOpen={onOpen}
          row={row}
          timeZone={timeZone}
          viewerId={viewerId}
        />
      ))}
    </List>
  );
}

function PageButton({
  page,
  current,
  onPage,
}: {
  page: number;
  current: boolean;
  onPage: (page: number) => void;
}) {
  const handleClick = useCallback(() => onPage(page), [onPage, page]);
  return (
    <button
      aria-current={current ? "page" : undefined}
      aria-label={`Page ${page}`}
      className={cn(
        "flex size-[34px] shrink-0 cursor-pointer items-center justify-center rounded-full text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2",
        current
          ? "bg-ink font-semibold text-white"
          : "font-medium text-ink hover:bg-fog"
      )}
      onClick={handleClick}
      type="button"
    >
      {page}
    </button>
  );
}

function StepIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" height="12" viewBox="0 0 14 14" width="12">
      <path
        d={direction === "left" ? "M8.5 3L4.5 7l4 4" : "M5.5 3l4 4-4 4"}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** "Showing 1 to 25 of 53" with page buttons (1KN-0 pagination footer). */
export function Pagination({
  page,
  pageCount,
  total,
  onPage,
}: {
  page: number;
  pageCount: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(total, page * PAGE_SIZE);
  const handlePrevious = useCallback(() => onPage(page - 1), [onPage, page]);
  const handleNext = useCallback(() => onPage(page + 1), [onPage, page]);
  const pages = Array.from({ length: pageCount }, (_, index) => index + 1);
  const step =
    "flex cursor-pointer items-center gap-[6px] rounded-full px-3 py-2 text-sm leading-[18px] outline-none focus-visible:ring-2 focus-visible:ring-ink disabled:cursor-default disabled:font-medium disabled:text-[#B5B5B5]";
  return (
    <nav
      aria-label="Pages"
      className="flex items-center justify-between pt-5 max-md:hidden"
    >
      <p className="text-muted text-sm leading-[18px]">
        Showing{" "}
        <span className="font-semibold text-ink">
          {first} to {last}
        </span>{" "}
        of {total}
      </p>
      {pageCount > 1 ? (
        <div className="flex items-center gap-1">
          <button
            className={cn(step, "font-medium text-ink")}
            disabled={page <= 1}
            onClick={handlePrevious}
            type="button"
          >
            <StepIcon direction="left" />
            Previous
          </button>
          {pages.map((value) => (
            <PageButton
              current={value === page}
              key={value}
              onPage={onPage}
              page={value}
            />
          ))}
          <button
            className={cn(step, "font-semibold text-ink")}
            disabled={page >= pageCount}
            onClick={handleNext}
            type="button"
          >
            Next
            <StepIcon direction="right" />
          </button>
        </div>
      ) : null}
    </nav>
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
          <Skeleton className="h-4 w-16 max-lg:hidden" />
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
  page,
  viewerId,
  timeZone,
  highlightId,
  onVoid,
  onOpen,
  onPage,
}: {
  rows: PaymentRow[] | undefined;
  isLoading: boolean;
  query: string;
  period: `${number}-${string}`;
  page: number;
  viewerId: Id;
  timeZone: string;
  highlightId: Id | undefined;
  onVoid: (feeId: Id) => void;
  onOpen: (feeId: Id) => void;
  onPage: (page: number) => void;
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
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount);
  const pageRows = rows.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);
  return (
    <div className="flex flex-col">
      <PaymentsTable
        highlightId={highlightId}
        onOpen={onOpen}
        onVoid={onVoid}
        rows={pageRows}
        timeZone={timeZone}
        viewerId={viewerId}
      />
      <PaymentsTabletRows
        highlightId={highlightId}
        onOpen={onOpen}
        onVoid={onVoid}
        rows={pageRows}
        timeZone={timeZone}
        viewerId={viewerId}
      />
      <PaymentsList
        highlightId={highlightId}
        onOpen={onOpen}
        rows={rows}
        timeZone={timeZone}
        viewerId={viewerId}
      />
      <Pagination
        onPage={onPage}
        page={current}
        pageCount={pageCount}
        total={rows.length}
      />
    </div>
  );
}
