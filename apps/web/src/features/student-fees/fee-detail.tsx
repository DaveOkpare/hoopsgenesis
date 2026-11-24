import { cn } from "@hoops-genesis/ui/lib/utils";
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import { CheckIcon } from "@/components/student/icons";
import {
  dayMonth,
  monthLabel,
  monthName,
  monthOf,
  toDateOnly,
} from "@/features/student-calendar/dates";
import { paidLine } from "@/features/student-fees/fee-views";
import type { FeeDue, MyFee } from "@/features/student-fees/queries";
import {
  capitalize,
  dueStatus,
  isWholeMonth,
  lastRecorder,
  paymentMethodLabel,
  periodRange,
} from "@/features/student-fees/selectors";
import type { DateOnly } from "@/features/types";
import { formatAmount, formatLongDate, formatMoney } from "@/lib/format";

/*
 * "Fee detail" (ST-5, FK2-0): one fee, reached from the fees list. The design draws an
 * unpaid fee (amount, "Unpaid · 18 days overdue", how to pay, past payments). A paid fee
 * shows its receipt in the same box; an estimate (no bill on the server, amount taken
 * from the last payment) says so.
 */

/** What the page shows: a real fee row, or the estimated period that's due. */
export type FeeSubject =
  | { kind: "fee"; fee: MyFee }
  | { kind: "estimate"; due: FeeDue };

interface Shown {
  amount: string;
  currency: string;
  description: string;
  periodEnd: DateOnly;
  periodStart: DateOnly;
}

function shown(subject: FeeSubject): Shown {
  if (subject.kind === "fee") {
    return subject.fee;
  }
  return { ...subject.due, description: "Fee" };
}

/** "NOVEMBER 2026 · MONTHLY FEE" */
function eyebrow(fee: Shown): string {
  if (isWholeMonth(fee.periodStart, fee.periodEnd)) {
    return `${monthLabel(monthOf(fee.periodStart))} · Monthly fee`;
  }
  return `${periodRange(fee.periodStart, fee.periodEnd)} · ${fee.description}`;
}

function StatusPill({
  subject,
  today,
  timeZone,
}: {
  subject: FeeSubject;
  today: DateOnly;
  timeZone: string;
}) {
  const pill = "self-start rounded-full px-3 py-[6px] text-[13px] leading-4";
  if (subject.kind === "fee" && subject.fee.status === "paid") {
    return (
      <p
        className={cn(
          pill,
          "flex items-center gap-[6px] bg-[#E3F4EA] font-semibold text-success"
        )}
      >
        <CheckIcon height={14} width={14} />
        {paidLine(subject.fee, timeZone, "sentence")}
      </p>
    );
  }
  if (subject.kind === "fee" && subject.fee.status === "voided") {
    return (
      <p className={cn(pill, "bg-fog font-semibold text-muted")}>
        Cancelled by the academy
      </p>
    );
  }
  const dueDate =
    subject.kind === "fee" ? subject.fee.dueDate : subject.due.dueDate;
  const status = dueStatus({ dueDate }, today);
  return (
    <p className={cn(pill, "bg-orange-soft font-semibold text-orange-deep")}>
      Unpaid · {status.charAt(0).toLowerCase()}
      {status.slice(1)}
    </p>
  );
}

function InfoBox({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-[10px] rounded-[20px] bg-fog p-[18px] md:p-6"
    >
      <h2 className="font-semibold text-base text-ink leading-5">{title}</h2>
      {children}
    </section>
  );
}

const boxText = "text-ink-soft text-sm leading-5";

function HowToPay({
  subject,
  payments,
}: {
  subject: FeeSubject;
  payments: MyFee[];
}) {
  const recorder = lastRecorder(payments);
  return (
    <InfoBox title="How to pay">
      <p className={boxText}>
        {recorder
          ? `Pay ${recorder} at the academy in cash or by mobile money. Once it’s recorded, this page updates.`
          : "Pay at the academy front desk in cash or by mobile money. Once the admin records it, this page updates."}
      </p>
      <p className={boxText}>
        {subject.kind === "estimate"
          ? "The academy hasn’t billed this period, so the amount is an estimate: the same as your last payment. Ask at the front desk if it has changed."
          : `Due on ${dayMonth(subject.fee.dueDate)}.`}
      </p>
    </InfoBox>
  );
}

function ReceiptRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-line border-b py-3 last:border-b-0 last:pb-0">
      <dt className="text-[15px] text-muted leading-5">{label}</dt>
      <dd className="text-right font-medium text-[15px] text-ink leading-5">
        {value}
      </dd>
    </div>
  );
}

function Receipt({ fee, timeZone }: { fee: MyFee; timeZone: string }) {
  const paidOn = fee.paidAt ? toDateOnly(fee.paidAt, timeZone) : null;
  return (
    <InfoBox title="Receipt">
      <dl className="-mt-1 flex flex-col">
        <ReceiptRow
          label="Amount"
          value={formatMoney({ amount: fee.amount, currency: fee.currency })}
        />
        {paidOn ? (
          <ReceiptRow
            label="Paid on"
            value={`${formatLongDate(paidOn)} ${paidOn.slice(0, 4)}`}
          />
        ) : null}
        {fee.paymentMethod ? (
          <ReceiptRow
            label="Method"
            value={capitalize(paymentMethodLabel(fee.paymentMethod))}
          />
        ) : null}
        {fee.paymentReference ? (
          <ReceiptRow label="Reference" value={fee.paymentReference} />
        ) : null}
        {fee.recordedBy ? (
          <ReceiptRow label="Recorded by" value={fee.recordedBy.name} />
        ) : null}
        <ReceiptRow
          label="Covers"
          value={periodRange(fee.periodStart, fee.periodEnd)}
        />
      </dl>
    </InfoBox>
  );
}

export function FeeDetail({
  subject,
  payments,
  today,
  timeZone,
}: {
  subject: FeeSubject;
  /** The student's payments (GET /me/fees), for "Past payments" and who to pay. */
  payments: MyFee[] | undefined;
  today: DateOnly;
  timeZone: string;
}) {
  const fee = shown(subject);
  const status = subject.kind === "fee" ? subject.fee.status : "unpaid";
  const currentId = subject.kind === "fee" ? subject.fee.id : null;
  const others = (payments ?? []).filter((p) => p.id !== currentId);
  return (
    <div className="grid items-start gap-5 md:gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-[10px]">
          <p className="font-semibold text-[12px] text-muted uppercase leading-4 tracking-label md:text-[13px]">
            {eyebrow(fee)}
          </p>
          <h1 className="flex items-baseline gap-2 text-ink">
            <span className="font-semibold text-lg leading-[22px]">
              {fee.currency}
            </span>
            <span className="font-display text-display-sm leading-[56px] md:text-[64px] md:leading-16">
              {formatAmount(fee.amount)}
            </span>
          </h1>
          <StatusPill subject={subject} timeZone={timeZone} today={today} />
        </div>
        {subject.kind === "fee" && status === "paid" ? (
          <Receipt fee={subject.fee} timeZone={timeZone} />
        ) : null}
        {status === "unpaid" || status === "overdue" ? (
          <HowToPay payments={payments ?? []} subject={subject} />
        ) : null}
        {status === "voided" ? (
          <InfoBox title="Cancelled">
            <p className={boxText}>
              The academy cancelled this entry, so it doesn’t count as paid. Ask
              at the front desk if that looks wrong.
            </p>
          </InfoBox>
        ) : null}
      </div>
      <PastPayments
        fees={others}
        timeZone={timeZone}
        title={status === "paid" ? "Other payments" : "Past payments"}
      />
    </div>
  );
}

function PastPayments({
  fees,
  title,
  timeZone,
}: {
  fees: MyFee[];
  title: string;
  timeZone: string;
}) {
  if (fees.length === 0) {
    return null;
  }
  return (
    <section aria-labelledby="past-payments" className="flex flex-col">
      <h2
        className="pb-1 font-medium text-[13px] text-muted uppercase leading-4 tracking-label"
        id="past-payments"
      >
        {title}
      </h2>
      <ul className="flex flex-col">
        {fees.map((fee) => (
          <li className="border-line border-b" key={fee.id}>
            <Link
              className="flex items-center gap-3 py-3 outline-none hover:bg-fog/60 focus-visible:bg-fog"
              params={{ feeId: fee.id }}
              to="/student/fees/$feeId"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
                <span className="font-semibold text-[15px] text-ink leading-5">
                  {monthName(monthOf(fee.periodStart))}
                </span>
                <span className="text-[13px] text-muted leading-4">
                  {paidLine(fee, timeZone, "sentence")}
                </span>
              </span>
              <span className="font-medium text-[15px] text-ink leading-5">
                {formatMoney({ amount: fee.amount, currency: fee.currency })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
