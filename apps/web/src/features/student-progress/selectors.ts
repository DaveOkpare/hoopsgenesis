/*
 * Progress over time for one result (ST-7). The results come from athletic records; what
 * counts as "the result" is the record template's metric (GET /record-templates): its
 * field, unit and which way is better (e.g. 100 m sprint: timeSeconds, lower is
 * better). Only verified results count toward "best"; a pending result is drawn but not
 * counted.
 */
import { monthNameShort } from "@/features/student-calendar/dates";
import type {
  RecordTemplate,
  StudentRecordView,
} from "@/features/student-records/queries";
import type { DateOnly } from "@/features/types";

/** One chart: a metric of an athletic template. */
export interface ResultSeries {
  better: "higher" | "lower";
  field: string;
  /** Tab id: the template key, or "<key>.<field>" for templates with several metrics. */
  id: string;
  label: string;
  template: string;
  unit: string | null;
}

export interface AthleticResult {
  /** Attempts, for drills scored "8 of 10" (data.attempts); null otherwise. */
  outOf: number | null;
  value: number;
}

export interface ResultPoint {
  record: StudentRecordView;
  result: AthleticResult;
}

export interface DrillProgress {
  /** The first verified result with the best score. */
  best: ResultPoint | null;
  /** Improvement from the first verified result to the best, and that result's month. */
  gain: { amount: number; label: string; since: string } | null;
  /** Oldest first. */
  points: ResultPoint[];
  series: ResultSeries;
  /** After the big number: "of 10", "s", or "". */
  suffix: string;
}

/** Each metric of each athletic template, as a chart. */
export function resultSeries(templates: RecordTemplate[]): ResultSeries[] {
  return templates
    .filter((template) => template.recordType === "athletic")
    .flatMap((template) =>
      template.metrics.map((metric) => {
        const single = template.metrics.length === 1;
        return {
          id: single ? template.key : `${template.key}.${metric.field}`,
          label: single ? template.label : metric.label,
          template: template.key,
          field: metric.field,
          unit: metric.unit,
          better: metric.better,
        };
      })
    );
}

function num(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The template a record was made from (`data.template`; fixture drills use `data.drill`). */
export function recordTemplateKey(record: StudentRecordView): string | null {
  if (record.template) {
    return record.template;
  }
  const { drill } = record.data;
  return typeof drill === "string" ? drill : null;
}

export function seriesResult(
  record: StudentRecordView,
  series: ResultSeries
): AthleticResult | null {
  if (
    record.recordType !== "athletic" ||
    recordTemplateKey(record) !== series.template
  ) {
    return null;
  }
  const value = num(record.data[series.field]);
  return value === null ? null : { value, outOf: num(record.data.attempts) };
}

/** Series to offer as tabs: single-metric templates always, others once they have data. */
export function seriesWithData(
  all: ResultSeries[],
  records: StudentRecordView[]
): ResultSeries[] {
  return all.filter(
    (series) =>
      series.id === series.template ||
      records.some((record) => seriesResult(record, series) !== null)
  );
}

const MAX_DECIMALS = 2;

/** 12.3456 -> "12.35", 8 -> "8". */
export function formatValue(value: number): string {
  return String(Number(value.toFixed(MAX_DECIMALS)));
}

/** "8 of 10", "12.34 s", "42". */
export function formatResult(
  result: AthleticResult,
  series: ResultSeries
): string {
  if (result.outOf !== null) {
    return `${formatValue(result.value)} of ${result.outOf}`;
  }
  return series.unit
    ? `${formatValue(result.value)} ${series.unit}`
    : formatValue(result.value);
}

function isBetter(a: number, b: number, series: ResultSeries): boolean {
  return series.better === "lower" ? a < b : a > b;
}

export function drillProgress(
  records: StudentRecordView[],
  series: ResultSeries
): DrillProgress {
  const points = records
    .flatMap((record) => {
      const result = seriesResult(record, series);
      return result && record.status !== "rejected" ? [{ record, result }] : [];
    })
    .sort((a, b) => a.record.recordedOn.localeCompare(b.record.recordedOn));
  const verified = points.filter((p) => p.record.status === "verified");
  let best: ResultPoint | null = null;
  for (const point of verified) {
    if (!best || isBetter(point.result.value, best.result.value, series)) {
      best = point;
    }
  }
  const [first] = verified;
  const amount =
    best && first ? Math.abs(best.result.value - first.result.value) : 0;
  const gain =
    best && first && best !== first && amount > 0
      ? {
          amount,
          label: series.unit
            ? `${formatValue(amount)} ${series.unit}`
            : formatValue(amount),
          since: monthNameShort(first.record.recordedOn),
        }
      : null;
  const outOf = best?.result.outOf ?? points.at(-1)?.result.outOf ?? null;
  let suffix = series.unit ?? "";
  if (outOf !== null) {
    suffix = `of ${outOf}`;
  }
  return { series, points, best, gain, suffix };
}

/** Chart axis label: "Today" for today's result, else the month ("Aug"). */
export function pointLabel(date: DateOnly, today: DateOnly): string {
  return date === today ? "Today" : monthNameShort(date);
}
