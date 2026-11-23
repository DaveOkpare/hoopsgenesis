/**
 * Converting database values to and from their API form. Serialize every
 * response field through these; never send a Prisma row as is.
 *
 * - Timestamps (timestamptz): ISO 8601 UTC, `2026-11-23T08:30:00.000Z`.
 * - Plain dates (@db.Date): `YYYY-MM-DD`. Prisma returns them as Dates at UTC
 *   midnight, and expects the same back.
 * - Times of day (@db.Time): `HH:MM` (or `HH:MM:SS` when seconds are set).
 *   Prisma returns them as Dates on 1970-01-01 UTC.
 * - Money (numeric): a decimal string such as "15000.00", never a number.
 */
import type { EventDates } from "./time";

const ISO_DATE_LENGTH = 10;
/** In an ISO string, `HH:MM:SS` sits at 11..19. */
const ISO_TIME_START = 11;
const ISO_TIME_END = 19;
const HH_MM_LENGTH = 5;
/** fee.amount is numeric(14, 2). */
const MONEY_SCALE = 2;

/** Anything with Decimal's `toFixed` (Prisma.Decimal). */
export interface DecimalLike {
  toFixed: (decimalPlaces: number) => string;
}

export const toTimestamp = (value: Date): string => value.toISOString();

export const toNullableTimestamp = (value: Date | null): string | null =>
  value === null ? null : value.toISOString();

/** A @db.Date value as `YYYY-MM-DD`. */
export const toPlainDate = (value: Date): string =>
  value.toISOString().slice(0, ISO_DATE_LENGTH);

export const toNullablePlainDate = (value: Date | null): string | null =>
  value === null ? null : toPlainDate(value);

/** `YYYY-MM-DD` to the Date Prisma expects for a @db.Date column. */
export const fromPlainDate = (value: string): Date =>
  new Date(`${value}T00:00:00.000Z`);

/** A @db.Time value as `HH:MM`, or `HH:MM:SS` if it has seconds. */
export const toTimeOfDay = (value: Date): string => {
  const time = value.toISOString().slice(ISO_TIME_START, ISO_TIME_END);
  return time.endsWith(":00") ? time.slice(0, HH_MM_LENGTH) : time;
};

export const toNullableTimeOfDay = (value: Date | null): string | null =>
  value === null ? null : toTimeOfDay(value);

/** `HH:MM[:SS]` to the Date Prisma expects for a @db.Time column. */
export const fromTimeOfDay = (value: string): Date =>
  new Date(
    `1970-01-01T${value.length === HH_MM_LENGTH ? `${value}:00` : value}.000Z`
  );

/** Money as a decimal string with 2 decimals: "15000.00". */
export const toMoneyString = (value: DecimalLike): string =>
  value.toFixed(MONEY_SCALE);

/** A calendar_event row's dates in the form ./time.ts works with. */
export const toEventDates = (event: {
  startDate: Date;
  endDate: Date | null;
  excludedDates: readonly Date[];
}): EventDates => ({
  startDate: toPlainDate(event.startDate),
  endDate: toNullablePlainDate(event.endDate),
  excludedDates: event.excludedDates.map(toPlainDate),
});

/** A `from`..`to` filter (both inclusive) on a @db.Date column. */
export const plainDateRange = (range: {
  from?: string;
  to?: string;
}): { gte?: Date; lte?: Date } => ({
  ...(range.from ? { gte: fromPlainDate(range.from) } : {}),
  ...(range.to ? { lte: fromPlainDate(range.to) } : {}),
});
