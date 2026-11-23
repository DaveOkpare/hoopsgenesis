/* Pure helpers for the student's fees (ST-5). */
import {
  dayMonth,
  dayOfMonth,
  daysBetween,
  monthName,
  monthNameShort,
  monthOf,
} from "@/features/student-calendar/dates";
import type { FeeDue } from "@/features/student-fees/queries";
import type { DateOnly, PaymentMethod } from "@/features/types";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "cash",
  bank_transfer: "bank transfer",
  mobile_money: "mobile money",
};

/** "November" */
export function dueMonthName(due: FeeDue): string {
  return monthName(monthOf(due.periodStart));
}

/** Days past the due date (0 or less when not yet overdue). */
export function overdueDays(due: FeeDue, today: DateOnly): number {
  return daysBetween(due.dueDate, today);
}

/** "18 days overdue", "Due today", "Due 5 Dec" */
export function dueStatus(due: FeeDue, today: DateOnly): string {
  const days = overdueDays(due, today);
  if (days > 0) {
    return days === 1 ? "1 day overdue" : `${days} days overdue`;
  }
  return days === 0 ? "Due today" : `Due ${dayMonth(due.dueDate)}`;
}

/** "covers 1–30 Nov" */
export function coversLabel(due: FeeDue): string {
  const sameMonth = monthOf(due.periodStart) === monthOf(due.periodEnd);
  const start = sameMonth
    ? String(dayOfMonth(due.periodStart))
    : dayMonth(due.periodStart);
  return `covers ${start}–${dayOfMonth(due.periodEnd)} ${monthNameShort(due.periodEnd)}`;
}
