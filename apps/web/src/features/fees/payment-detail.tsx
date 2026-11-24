/*
 * One payment (`?fee=<feeId>`, GET /fees/:id): a right-hand panel over the Fees page from
 * 768px up (GS7-0, voided H06-0) and its own page on phones (GOA-0). Voiding opens the
 * existing void dialog (`?void=`); a voided payment shows who voided it, when and why.
 */
import { Avatar, AvatarFallback } from "@hoops-genesis/ui/components/avatar";
import { Button } from "@hoops-genesis/ui/components/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerTitle,
} from "@hoops-genesis/ui/components/drawer";
import { Skeleton } from "@hoops-genesis/ui/components/skeleton";
import { cn } from "@hoops-genesis/ui/lib/utils";
import { useQuery } from "@tanstack/react-query";
import { type ReactNode, useCallback } from "react";

import {
  methodLabel,
  periodKeyOf,
  periodLongLabel,
  periodMonthName,
} from "@/features/fees/periods";
import { feeQueryOptions, type PaymentRow } from "@/features/fees/queries";
import type { Id } from "@/features/types";
import { errorMessage, isApiError } from "@/lib/api-client";
import {
  formatAmount,
  formatDayMonth,
  formatTime,
  initials,
} from "@/lib/format";

const WHITESPACE = /\s+/;

/** "Sharika D." */
function shortName(name: string | null): string {
  if (!name) {
    return "Someone";
  }
  const words = name.trim().split(WHITESPACE);
  const last = words.length > 1 ? words.at(-1)?.[0] : null;
  return last ? `${words[0]} ${last}.` : (words[0] ?? name);
}

/** "Thu 5 Nov" */
function weekdayDayMonth(value: string, timeZone: string): string {
  const weekday = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    weekday: "short",
  }).format(new Date(value));
  return `${weekday} ${formatDayMonth(value, timeZone)}`;
}

function Row({
  label,
  children,
  mono = false,
  className,
}: {
  label: string;
  children: string;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex justify-between gap-4 border-line border-b py-[13px] text-[15px] leading-5 last:border-b-0 max-md:py-3",
        className
      )}
    >
      <dt className="text-muted">{label}</dt>
      <dd
        className={cn("text-right font-medium text-ink", mono && "font-mono")}
      >
        {children}
      </dd>
    </div>
  );
}

function StatusPill({ row }: { row: PaymentRow }) {
  const month = periodMonthName(periodKeyOf(row.periodStart));
  let tone = "bg-[#E3F4EA] text-success";
  let text = `Paid · covers ${month}`;
  if (row.voidedAt) {
    tone = "bg-fog text-muted";
    text = "Voided · does not count";
  } else if (!row.paidAt) {
    tone = "bg-orange-soft text-orange-deep";
    text = "Billed · not paid yet";
  }
  return (
    <p
      className={cn(
        "self-start rounded-full px-[11px] py-[5px] font-semibold text-[13px] leading-4",
        tone
      )}
    >
      {text}
    </p>
  );
}

function Summary({ row }: { row: PaymentRow }) {
  const isVoided = row.voidedAt !== null;
  const struck = isVoided && "text-muted line-through decoration-1";
  return (
    <div className="flex flex-col gap-2 max-md:gap-3">
      <div className="flex items-center gap-3">
        <Avatar className="size-10" size={44} tone="fog">
          <AvatarFallback className="text-[13px]">
            {initials(row.student.name)}
          </AvatarFallback>
        </Avatar>
        <div className="flex min-w-0 flex-col">
          <p className="font-semibold text-[17px] text-ink leading-[22px]">
            {row.student.name}
          </p>
          <p className="text-muted text-sm leading-[18px]">
            {row.student.teamName ?? "No team"} · Student
          </p>
        </div>
      </div>
      <p className="flex items-baseline gap-2 pt-3 max-md:pt-0">
        <span
          className={cn(
            "font-semibold text-ink text-lg leading-[22px]",
            struck
          )}
        >
          {row.currency}
        </span>
        <span
          className={cn(
            "font-display text-display-sm text-ink leading-[56px]",
            struck
          )}
        >
          {formatAmount(row.amount)}
        </span>
      </p>
      <StatusPill row={row} />
    </div>
  );
}

function Details({
  row,
  timeZone,
  compact,
}: {
  row: PaymentRow;
  timeZone: string;
  compact: boolean;
}) {
  const recordedAt = compact
    ? formatDayMonth(row.createdAt, timeZone)
    : `${formatDayMonth(row.createdAt, timeZone)} at ${formatTime(row.createdAt, timeZone)}`;
  const isCash = row.paymentMethod === "cash";
  const recordedBy = row.recordedByName
    ? `${shortName(row.recordedByName)}, ${recordedAt}`
    : recordedAt;
  return (
    <dl className="flex flex-col">
      {compact ? null : (
        <Row label="For">
          {row.description ||
            `${periodLongLabel(periodKeyOf(row.periodStart))} fee`}
        </Row>
      )}
      <Row label="Paid on">
        {row.paidAt ? weekdayDayMonth(row.paidAt, timeZone) : "Not paid"}
      </Row>
      <Row label="Method">{methodLabel(row.paymentMethod)}</Row>
      <Row
        label={isCash && !row.paymentReference ? "Receipt" : "Reference"}
        mono={Boolean(row.paymentReference)}
      >
        {row.paymentReference ?? "None"}
      </Row>
      <Row label="Recorded by">{recordedBy}</Row>
    </dl>
  );
}

function VoidedBox({ row, timeZone }: { row: PaymentRow; timeZone: string }) {
  if (!row.voidedAt) {
    return null;
  }
  return (
    <div className="flex flex-col gap-2 rounded-md bg-orange-soft px-5 py-[18px]">
      <p className="font-semibold text-[15px] text-orange-deep leading-5">
        Voided by {shortName(row.voidedByName)} on{" "}
        {formatDayMonth(row.voidedAt, timeZone)} at{" "}
        {formatTime(row.voidedAt, timeZone)}
      </p>
      {row.voidReason ? (
        <p className="text-ink text-sm leading-5">Reason: “{row.voidReason}”</p>
      ) : null}
      <p className="text-[13px] text-muted leading-[18px]">
        A voided payment can't be changed or brought back. It stays in the
        activity log.
      </p>
    </div>
  );
}

function VoidAction({
  row,
  compact,
  onVoid,
}: {
  row: PaymentRow;
  compact: boolean;
  onVoid: (feeId: Id) => void;
}) {
  const handleClick = useCallback(() => onVoid(row.id), [onVoid, row.id]);
  return (
    <div
      className={cn(
        "flex flex-col gap-[10px]",
        !compact && "border-line border-t pt-5"
      )}
    >
      <p
        className={cn(
          "text-muted",
          compact ? "text-[13px] leading-[18px]" : "text-sm leading-5"
        )}
      >
        {compact
          ? "Wrong amount or wrong student? Void it and record it again."
          : "Wrong amount or wrong student? Void it and record it again. A voided payment stays in the list, crossed out, with your reason."}
      </p>
      <Button
        className={cn(
          "border-orange-deep text-orange-deep hover:bg-orange-soft hover:text-orange-deep",
          compact ? "w-full text-[15px]" : "self-start px-[18px]"
        )}
        onClick={handleClick}
        size={compact ? "default" : "sm"}
        variant="outline"
      >
        Void payment
      </Button>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-4" role="status">
      <span className="sr-only">Loading the payment</span>
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="flex flex-col gap-1.5">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <Skeleton className="h-14 w-48" />
      <Skeleton className="h-6 w-40 rounded-full" />
      <Skeleton className="h-48 w-full" />
    </div>
  );
}

function DetailError({ error }: { error: unknown }) {
  return (
    <div className="flex flex-col gap-1 rounded-md bg-fog p-5" role="alert">
      <p className="font-semibold text-[15px] text-ink leading-5">
        {isApiError(error, "not_found")
          ? "Payment not found"
          : "Couldn't load this payment"}
      </p>
      <p className="text-muted text-sm leading-5">
        {isApiError(error, "not_found")
          ? "It may belong to another academy, or the link is wrong."
          : errorMessage(error)}
      </p>
    </div>
  );
}

function usePayment(academyId: Id, feeId: Id | undefined) {
  return useQuery({
    ...feeQueryOptions(academyId, feeId ?? ""),
    enabled: Boolean(academyId && feeId),
    throwOnError: false,
  });
}

/** GS7-0 / H06-0: the right-hand panel (768px and up). */
export function PaymentDetailPanel({
  academyId,
  feeId,
  timeZone,
  onClose,
  onVoid,
}: {
  academyId: Id;
  feeId: Id | undefined;
  timeZone: string;
  onClose: () => void;
  onVoid: (feeId: Id) => void;
}) {
  const payment = usePayment(academyId, feeId);
  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        onClose();
      }
    },
    [onClose]
  );
  const row = payment.data;
  let body: ReactNode = <DetailSkeleton />;
  if (row) {
    body = (
      <>
        <div className="flex flex-col gap-6">
          <Summary row={row} />
          <Details compact={false} row={row} timeZone={timeZone} />
        </div>
        {row.voidedAt ? (
          <VoidedBox row={row} timeZone={timeZone} />
        ) : (
          <VoidAction compact={false} onVoid={onVoid} row={row} />
        )}
      </>
    );
  } else if (payment.isError) {
    body = <DetailError error={payment.error} />;
  }
  return (
    <Drawer onOpenChange={handleOpenChange} open={Boolean(feeId)}>
      <DrawerContent
        backdropClassName="bg-[#11111152]"
        className="w-[480px] gap-6 bg-white px-8 py-7"
        side="right"
      >
        <div className="flex items-center justify-between">
          <DrawerTitle className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
            Payment
          </DrawerTitle>
          <DrawerClose
            aria-label="Close"
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fog text-ink outline-none hover:bg-line focus-visible:ring-2 focus-visible:ring-ink"
          >
            <svg aria-hidden="true" height="14" viewBox="0 0 16 16" width="14">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                strokeLinecap="round"
                strokeWidth="1.8"
              />
            </svg>
          </DrawerClose>
        </div>
        <div className="flex flex-1 flex-col justify-between gap-6">{body}</div>
      </DrawerContent>
    </Drawer>
  );
}

/** GOA-0: the payment as its own page on phones. */
export function PhonePaymentDetail({
  academyId,
  feeId,
  timeZone,
  onBack,
  onVoid,
}: {
  academyId: Id;
  feeId: Id;
  timeZone: string;
  onBack: () => void;
  onVoid: (feeId: Id) => void;
}) {
  const payment = usePayment(academyId, feeId);
  const row = payment.data;
  let body: ReactNode = <DetailSkeleton />;
  if (row) {
    body = (
      <>
        <Summary row={row} />
        <Details compact row={row} timeZone={timeZone} />
        {row.voidedAt ? (
          <VoidedBox row={row} timeZone={timeZone} />
        ) : (
          <VoidAction compact onVoid={onVoid} row={row} />
        )}
      </>
    );
  } else if (payment.isError) {
    body = <DetailError error={payment.error} />;
  }
  return (
    <section aria-label="Payment" className="flex flex-col gap-[18px]">
      <button
        className="flex cursor-pointer items-center gap-1 self-start rounded-sm font-medium text-[15px] text-ink leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ink"
        onClick={onBack}
        type="button"
      >
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
          <path
            d="M10 3L5 8l5 5"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.8"
          />
        </svg>
        Payments
      </button>
      {body}
    </section>
  );
}
