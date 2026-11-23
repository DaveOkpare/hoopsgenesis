/* Pure helpers for the student's fees (ST-5). */
import {
  dayMonth,
  dayOfMonth,
  daysBetween,
  firstOfMonth,
  lastOfMonth,
  monthName,
  monthNameShort,
  monthOf,
} from "@/features/student-calendar/dates";
import type { FeeDue, MyFee } from "@/features/student-fees/queries";
import type { DateOnly, PaymentMethod } from "@/features/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "cash",
  bank_transfer: "bank transfer",
  mobile_money: "mobile money",
};

/** "mobile money"; a provider's own method ("card") as it comes, underscores spaced. */
export function paymentMethodLabel(method: string): string {
  return (
    PAYMENT_METHOD_LABEL[method as PaymentMethod] ?? method.replaceAll("_", " ")
  );
}

/** "Mobile money" */
export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** A whole calendar month ("2026-11-01" to "2026-11-30")? */
export function isWholeMonth(start: DateOnly, end: DateOnly): boolean {
  return (
    start === firstOfMonth(monthOf(start)) &&
    end === lastOfMonth(monthOf(start))
  );
}

/** "November" */
export function dueMonthName(due: FeeDue): string {
  return monthName(monthOf(due.periodStart));
}

/** Days past the due date (0 or less when not yet overdue). */
export function overdueDays(due: Pick<FeeDue, "dueDate">, today: DateOnly) {
  return daysBetween(due.dueDate, today);
}

/** "18 days overdue", "Due today", "Due 5 Dec" */
export function dueStatus(
  due: Pick<FeeDue, "dueDate">,
  today: DateOnly
): string {
  const days = overdueDays(due, today);
  if (days > 0) {
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  return days === 0 ? "Due today" : `Due ${dayMonth(due.dueDate)}`;
}

/** "1–30 Nov", "15 Nov – 14 Dec" */
export function periodRange(start: DateOnly, end: DateOnly): string {
  const sameMonth = monthOf(start) === monthOf(end);
  const from = sameMonth ? String(dayOfMonth(start)) : `${dayMonth(start)} `;
  return `${from}–${sameMonth ? "" : " "}${dayOfMonth(end)} ${monthNameShort(end)}`;
}

/** "covers 1–30 Nov" */
export function coversLabel(due: FeeDue): string {
  return `covers ${periodRange(due.periodStart, due.periodEnd)}`;
}

/** The latest payment someone recorded at the academy (for "Pay Sharika D. …"). */
export function lastRecorder(payments: MyFee[]): string | null {
  return payments.find((fee) => fee.recordedBy)?.recordedBy?.name ?? null;
}
