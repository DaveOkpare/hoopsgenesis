import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@hoops-genesis/ui/components/dialog";
import { cn } from "@hoops-genesis/ui/lib/utils";

import { CheckIcon } from "@/components/student/icons";
import {
  dayMonth,
  monthLabel,
  monthOf,
  toDateOnly,
} from "@/features/student-calendar/dates";
import type { FeeDue, MyFee } from "@/features/student-fees/queries";
import {
  coversLabel,
  dueMonthName,
  dueStatus,
  overdueDays,
  PAYMENT_METHOD_LABEL,
} from "@/features/student-fees/selectors";
import type { DateOnly } from "@/features/types";
import { formatAmount, formatLongDate, formatMoney } from "@/lib/format";

/* Pieces of "[Student] My fees" (48R-0). Read-only: the admin records payments. */

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
      className="flex flex-col gap-4 rounded-lg bg-ink p-5 md:gap-5 md:p-7"
    >
      <div className="flex items-center justify-between gap-3">
        <h2
          className="font-semibold text-[#BDBDBD] text-[13px] uppercase leading-4 tracking-label"
          id="fee-due-title"
        >
          {dueMonthName(due)} fee
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
      </p>
      {onlinePayment ? (
        <button
          className="rounded-full bg-white p-4 font-semibold text-base text-ink leading-5 outline-none hover:bg-white/90 focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
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
          : "Pay at the front desk in cash or by Mobile Money. The admin records it and it shows here."}
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
        {paidUpTo ? `Paid up to ${dayMonth(paidUpTo)}` : "Nothing due"}
      </p>
    </section>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-[14px] last:border-b-0">
      <dt className="text-[15px] text-muted leading-[18px]">{label}</dt>
      <dd className="text-right font-medium text-[15px] text-ink leading-[18px]">
        {value}
      </dd>
    </div>
  );
}

function Receipt({ fee, timeZone }: { fee: MyFee; timeZone: string }) {
  const paidOn = fee.paidAt ? toDateOnly(fee.paidAt, timeZone) : null;
  return (
    <Dialog>
      <DialogTrigger
        aria-label={`Receipt for ${monthLabel(monthOf(fee.periodStart))}`}
        className="cursor-pointer rounded-sm font-semibold text-[13px] text-ink leading-4 underline decoration-1 underline-offset-2 outline-none hover:decoration-2 focus-visible:ring-2 focus-visible:ring-ink"
      >
        Receipt
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Receipt</DialogTitle>
          <DialogDescription>{fee.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="pb-8">
          <dl className="flex flex-col rounded-md bg-fog px-4">
            <ReceiptRow
              label="Amount"
              value={formatMoney({
                amount: fee.amount,
                currency: fee.currency,
              })}
            />
            {paidOn ? (
              <ReceiptRow
                label="Paid"
                value={`${formatLongDate(paidOn)} ${paidOn.slice(0, 4)}`}
              />
            ) : null}
            {fee.paymentMethod ? (
              <ReceiptRow
                label="Method"
                value={capitalize(PAYMENT_METHOD_LABEL[fee.paymentMethod])}
              />
            ) : null}
            {fee.paymentReference ? (
              <ReceiptRow label="Reference" value={fee.paymentReference} />
            ) : null}
            {fee.recordedByName ? (
              <ReceiptRow label="Recorded by" value={fee.recordedByName} />
            ) : null}
            <ReceiptRow
              label="Covers"
              value={`${dayMonth(fee.periodStart)} – ${dayMonth(fee.periodEnd)}`}
            />
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
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
                  Paid{" "}
                  {fee.paidAt
                    ? dayMonth(toDateOnly(fee.paidAt, timeZone))
                    : "—"}
                  {fee.paymentMethod
                    ? ` · ${PAYMENT_METHOD_LABEL[fee.paymentMethod]}`
                    : ""}
                </span>
              </span>
              <span className="flex flex-col items-end">
                <span className="font-semibold text-[15px] text-ink leading-[18px]">
                  {formatMoney({ amount: fee.amount, currency: fee.currency })}
                </span>
                <Receipt fee={fee} timeZone={timeZone} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
