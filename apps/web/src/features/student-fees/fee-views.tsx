import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";

import { CheckIcon } from "@/components/student/icons";
import {
  dayMonth,
  monthLabel,
  monthOf,
  toDateOnly,
} from "@/features/student-calendar/dates";
import {
  ESTIMATED_DUE_ID,
  type FeeDue,
  type MyFee,
} from "@/features/student-fees/queries";
import {
  coversLabel,
  dueMonthName,
  dueStatus,
  overdueDays,
  paymentMethodLabel,
} from "@/features/student-fees/selectors";
import type { DateOnly } from "@/features/types";
import { formatAmount, formatMoney } from "@/lib/format";

/* Pieces of "[Student] My fees" (48R-0). Read-only: the admin records payments. */

const linkText =
  "rounded-sm font-semibold text-ink underline decoration-1 underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink";

/** The detail page of what's due: the billed fee, or the estimate. */
export function dueDetailParams(due: FeeDue): { feeId: string } {
  return { feeId: due.feeId ?? ESTIMATED_DUE_ID };
}

export function FeeDueCard({
  due,
  today,
  onlinePayment,
}: {
  due: FeeDue;
  today: DateOnly;
  onlinePayment: boolean;
}) {
  const overdue = overdueDays(due, today) > 0;
  return (
    <section
      aria-labelledby="fee-due-title"
      className="relative flex flex-col gap-4 rounded-lg bg-ink p-5 md:gap-5 md:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="font-semibold text-[#BDBDBD] text-[13px] uppercase leading-4 tracking-label"
          id="fee-due-title"
        >
          {/* The whole card opens the fee's page (FK2-0). */}
          <Link
            className="rounded-sm outline-none after:absolute after:inset-0 after:rounded-lg focus-visible:after:ring-2 focus-visible:after:ring-white focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-ink"
            params={dueDetailParams(due)}
            to="/student/fees/$feeId"
          >
            {dueMonthName(due)} fee
          </Link>
        </h2>
        <span
          className={cn(
            "rounded-full px-[10px] py-1 font-bold text-[12px] uppercase leading-4",
            overdue ? "bg-orange text-ink" : "bg-white/16 text-white"
          )}
        >
          {dueStatus(due, today)}
        </span>
      </div>
      <p className="flex items-baseline gap-2">
        <span className="font-semibold text-[#BDBDBD] text-lg leading-[22px]">
          {due.currency}
        </span>
        <span className="font-display text-[64px] text-white leading-[90%]">
          {formatAmount(due.amount)}
        </span>
      </p>
      <p className="text-[#BDBDBD] text-sm leading-[18px]">
        {overdue ? "Was due" : "Due"} {dayMonth(due.dueDate)} ·{" "}
        {coversLabel(due)}
        {due.estimated ? (
          <>
            <br />
            Estimate: the same as your last payment. The academy hasn’t billed
            this month.
          </>
        ) : null}
      </p>
      {onlinePayment ? (
        <button
          className="relative rounded-full bg-white p-4 font-semibold text-base text-ink leading-5 outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
          type="button"
        >
          Pay now
        </button>
      ) : null}
      <p
        className={cn(
          "text-[#8C8C8C] text-[13px] leading-4",
          onlinePayment && "text-center"
        )}
      >
        {onlinePayment
          ? "Paying cash? Hand it to the front desk and it shows here once recorded."
          : "Pay at the front desk in cash or by mobile money. The admin records it and it shows here."}
      </p>
    </section>
  );
}

export function PaidUpCard({ paidUpTo }: { paidUpTo: DateOnly | null }) {
  return (
    <section className="flex flex-col gap-2 rounded-lg bg-fog p-5 md:p-7">
      <h2 className="font-semibold text-[13px] text-muted uppercase leading-4 tracking-label">
        All paid
      </h2>
      <p className="font-display text-[40px] text-ink uppercase leading-none">
        {paidUpTo ? `Paid up to ${dayMonth(paidUpTo)}` : "Paid up"}
      </p>
    </section>
  );
}

/**
 * Nothing covers today and there is no bill or payment to go by: say so, and who to
 * ask. Never "all paid" (spec AGW-0: waiting on someone else).
 */
export function NoFeeRecordCard() {
  return (
    <section
      aria-labelledby="no-fee-title"
      className="flex flex-col gap-2 rounded-lg bg-fog p-5 md:p-7"
    >
      <h2
        className="font-semibold text-ink text-lg leading-6"
        id="no-fee-title"
      >
        No fees recorded yet
      </h2>
      <p className="text-ink-soft text-sm leading-5">
        The academy hasn’t recorded a payment or a bill for you. Ask at the
        front desk what you owe. Payments show here once the admin records them.
      </p>
    </section>
  );
}

/** "Paid 1 Oct · cash" */
export function paidLine(fee: MyFee, timeZone: string, method = true): string {
  const paid = fee.paidAt
    ? `Paid ${dayMonth(toDateOnly(fee.paidAt, timeZone))}`
    : "Paid";
  return method && fee.paymentMethod
    ? `${paid} · ${paymentMethodLabel(fee.paymentMethod)}`
    : paid;
}

export function PaymentHistory({
  fees,
  timeZone,
}: {
  fees: MyFee[];
  timeZone: string;
}) {
  return (
    <section aria-labelledby="paid-title" className="flex flex-col">
      <h2
        className="pb-[6px] font-semibold text-[13px] text-muted uppercase leading-4 tracking-label"
        id="paid-title"
      >
        Paid
      </h2>
      {fees.length === 0 ? (
        <p className="py-[14px] text-muted text-sm leading-5">
          No payments yet. They show here once the academy records them.
        </p>
      ) : (
        <ul className="flex flex-col">
          {fees.map((fee) => (
            <li
              className="flex items-center gap-3 border-line border-b py-[14px]"
              key={fee.id}
            >
              <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-fog text-success">
                <CheckIcon />
              </span>
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {monthLabel(monthOf(fee.periodStart))}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {paidLine(fee, timeZone)}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {formatMoney({ amount: fee.amount, currency: fee.currency })}
                </span>
                <Link
                  aria-label={`Receipt for ${monthLabel(monthOf(fee.periodStart))}`}
                  className={cn(linkText, "text-[13px] leading-4")}
                  params={{ feeId: fee.id }}
                  to="/student/fees/$feeId"
                >
                  Receipt
                </Link>
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
