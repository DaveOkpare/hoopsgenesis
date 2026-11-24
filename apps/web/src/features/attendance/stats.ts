/* Pure attendance arithmetic for the screens. */

export interface Counts {
  absent: number;
  late: number;
  present: number;
}

const PERCENT = 100;

/** (present + late) / (present + late + absent), or null with nothing counted. */
export function rateOf(counts: Counts): number | null {
  const counted = counts.present + counts.late + counts.absent;
  return counted === 0 ? null : (counts.present + counts.late) / counted;
}

/** "88%", or "–" with no data. */
export function percent(rate: number | null): string {
  return rate === null ? "–" : `${Math.round(rate * PERCENT)}%`;
}

/** Whole percentage points between two rates, or null. */
export function pointsBetween(
  rate: number | null,
  previous: number | null
): number | null {
  if (rate === null || previous === null) {
    return null;
  }
  return Math.round(rate * PERCENT) - Math.round(previous * PERCENT);
}

/** Share of counted rows, 0..1. */
export function shareOf(part: number, counts: Counts): number {
  const counted = counts.present + counts.late + counts.absent;
  return counted === 0 ? 0 : part / counted;
}

/** Team rates below this are drawn in orange (8EI-0: 79% is, 84% isn't). */
export const LOW_TEAM_RATE = 0.8;
/** Student rates below this are drawn in orange (8EI-0: 60% is, 73% isn't). */
export const LOW_STUDENT_RATE = 0.7;

export function isLow(rate: number | null, threshold = LOW_TEAM_RATE): boolean {
  return rate !== null && rate < threshold;
}
