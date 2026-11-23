/*
 * Pure helpers for fee periods (one calendar month) and payment labels. No data access,
 * so components and api.ts can both use them.
 */
import type { DateOnly, PaymentMethod } from "@/features/types";

/** "2026-11" */
export type PeriodKey = `${number}-${string}`;

const PERIOD_KEY = /^\d{4}-\d{2}$/;
const DUE_DAY = "05";
const MS_PER_DAY = 86_400_000;

export function isPeriodKey(value: unknown): value is PeriodKey {
  return typeof value === "string" && PERIOD_KEY.test(value);
}

function parts(key: PeriodKey): { year: number; month: number } {
  const [year, month] = key.split("-").map(Number);
  return { year: year ?? 0, month: month ?? 1 };
}

function keyFrom(year: number, month: number): PeriodKey {
  return `${year}-${String(month).padStart(2, "0")}` as PeriodKey;
}

/** Month in the academy's time zone that contains `date`. */
export function periodOf(date: Date, timeZone: string): PeriodKey {
  const iso = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
  }).format(date);
  return iso.slice(0, 7) as PeriodKey;
}

export function addMonths(key: PeriodKey, count: number): PeriodKey {
  const { year, month } = parts(key);
  const index = year * 12 + (month - 1) + count;
  return keyFrom(Math.floor(index / 12), (index % 12) + 1);
}

export function periodStart(key: PeriodKey): DateOnly {
  return `${key}-01`;
}

export function periodEnd(key: PeriodKey): DateOnly {
  const { year, month } = parts(key);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${key}-${String(lastDay).padStart(2, "0")}`;
}

export function periodDueDate(key: PeriodKey): DateOnly {
  return `${key}-${DUE_DAY}`;
}

export function periodKeyOf(date: DateOnly): PeriodKey {
  return date.slice(0, 7) as PeriodKey;
}

function utcDate(key: PeriodKey, day = 1): Date {
  const { year, month } = parts(key);
  return new Date(Date.UTC(year, month - 1, day, 12));
}

/** "November 2026" */
export function periodLongLabel(key: PeriodKey): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(key));
}

/** "Nov 2026" */
export function periodShortLabel(key: PeriodKey): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(utcDate(key));
}

/** "November" */
export function periodMonthName(key: PeriodKey): string {
  return new Intl.DateTimeFormat("en-GB", {
    month: "long",
    timeZone: "UTC",
  }).format(utcDate(key));
}

/** "1 – 30 Nov 2026" */
export function periodRangeLabel(key: PeriodKey): string {
  const lastDay = Number(periodEnd(key).slice(8));
  return `1 – ${lastDay} ${periodShortLabel(key)}`;
}

/** "Nov 2026 tuition", the fee description sent with POST /fees. */
export function periodDescription(key: PeriodKey): string {
  return `${periodShortLabel(key)} tuition`;
}

/** Whole calendar days from a plain date to `now`, in the academy's time zone. */
export function daysSince(date: DateOnly, now: Date, timeZone: string): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      MS_PER_DAY
  );
}

/** Today's plain date in the academy's time zone. */
export function todayIn(now: Date, timeZone: string): DateOnly {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank transfer",
  mobile_money: "Mobile money",
};

/** Phone buttons use short labels ("MoMo", "Bank"). */
const METHOD_SHORT_LABEL: Record<PaymentMethod, string> = {
  cash: "Cash",
  bank_transfer: "Bank",
  mobile_money: "MoMo",
};

export function methodLabel(method: PaymentMethod | null): string {
  return method ? METHOD_LABEL[method] : "Unknown";
}

export function methodShortLabel(method: PaymentMethod): string {
  return METHOD_SHORT_LABEL[method];
}

export const PAYMENT_METHODS = [
  "cash",
  "bank_transfer",
  "mobile_money",
] as const satisfies readonly PaymentMethod[];

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return PAYMENT_METHODS.includes(value as PaymentMethod);
}
