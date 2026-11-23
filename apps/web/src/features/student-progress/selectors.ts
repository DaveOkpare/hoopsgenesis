/*
 * Progress over time for one drill (ST-7). Only verified results count toward "best";
 * a pending result is drawn but not counted.
 */
import { monthNameShort } from "@/features/student-calendar/dates";
import type { StudentRecordView } from "@/features/student-records/queries";
import {
  type AthleticResult,
  athleticResult,
} from "@/features/student-records/record-data";
import type { DateOnly } from "@/features/types";

export const DRILLS = [
  { id: "free_throws", label: "Free throws" },
  { id: "three_point", label: "3-pt shooting" },
] as const;

export type DrillId = (typeof DRILLS)[number]["id"];

export function drillLabel(drill: string): string {
  return DRILLS.find((d) => d.id === drill)?.label ?? drill;
}

export interface ResultPoint {
  record: StudentRecordView;
  result: AthleticResult;
}

export interface DrillProgress {
  attempts: number;
  /** The first verified result with the best score. */
  best: ResultPoint | null;
  /** Best minus the first verified result, and that result's month ("Aug"). */
  gain: { amount: number; since: string } | null;
  /** Oldest first. */
  points: ResultPoint[];
}

export function drillProgress(
  records: StudentRecordView[],
  drill: DrillId
): DrillProgress {
  const points = records
    .flatMap((record) => {
      const result = athleticResult(record);
      return result?.drill === drill && record.status !== "rejected"
        ? [{ record, result }]
        : [];
    })
    .sort((a, b) => a.record.recordedOn.localeCompare(b.record.recordedOn));
  const verified = points.filter((p) => p.record.status === "verified");
  let best: ResultPoint | null = null;
  for (const point of verified) {
    if (!best || point.result.made > best.result.made) {
      best = point;
    }
  }
  const [first] = verified;
  const gain =
    best && first && best !== first
      ? {
          amount: best.result.made - first.result.made,
          since: monthNameShort(first.record.recordedOn),
        }
      : null;
  return {
    points,
    best,
    gain,
    attempts: best?.result.attempts ?? points.at(-1)?.result.attempts ?? 10,
  };
}

/** Chart axis label: "Today" for today's result, else the month ("Aug"). */
export function pointLabel(date: DateOnly, today: DateOnly): string {
  return date === today ? "Today" : monthNameShort(date);
}
