/*
 * Athletic result templates (CO-8). The stories leave open where templates live; until
 * then they are app config, here. Each one says which fields its `data` has, and the
 * form on "Log a result" is built from that.
 */

export type DrillId = "free_throws" | "three_point" | "dribbling";

export interface ResultTemplate {
  /** Fixed number of attempts for "made of N" drills. */
  attempts?: number;
  /** Lower is better for timed drills. */
  better: "higher" | "lower";
  id: DrillId;
  label: string;
  /** Plural used in "Jean's recent free throws". */
  lowerLabel: string;
  metric: "made" | "seconds";
  sport: "basketball";
}

const ATTEMPTS = 10;

export const RESULT_TEMPLATES: ResultTemplate[] = [
  {
    id: "free_throws",
    label: "Free throws",
    lowerLabel: "free throws",
    sport: "basketball",
    metric: "made",
    attempts: ATTEMPTS,
    better: "higher",
  },
  {
    id: "three_point",
    label: "3-pt shooting",
    lowerLabel: "3-pt shooting",
    sport: "basketball",
    metric: "made",
    attempts: ATTEMPTS,
    better: "higher",
  },
  {
    id: "dribbling",
    label: "Dribbling",
    lowerLabel: "dribbling times",
    sport: "basketball",
    metric: "seconds",
    better: "lower",
  },
];

export function templateFor(id: string): ResultTemplate | undefined {
  return RESULT_TEMPLATES.find((t) => t.id === id);
}

export function isDrillId(value: unknown): value is DrillId {
  return RESULT_TEMPLATES.some((t) => t.id === value);
}

/** Result `data` as stored on an athletic record. */
export type AthleticData =
  | { drill: "free_throws" | "three_point"; made: number; attempts: number }
  | { drill: "dribbling"; seconds: number };

/** "Free throws · 7 of 10", "Dribbling · 41 s". */
export function formatResult(data: AthleticData): string {
  const label = templateFor(data.drill)?.label ?? data.drill;
  if ("seconds" in data) {
    return `${label} · ${data.seconds} s`;
  }
  return `${label} · ${data.made} of ${data.attempts}`;
}

/** The number a result is judged by. */
export function resultScore(data: AthleticData): number {
  return "seconds" in data ? data.seconds : data.made;
}
