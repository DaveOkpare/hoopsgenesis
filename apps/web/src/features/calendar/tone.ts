/*
 * Team colours on the calendar and attendance screens (dots, bars, outlined chips).
 * Teams have no colour on the server, so real mode picks one from the team id (stable
 * across roles and reloads); preview fixtures set the designs' colours. Academy-wide
 * events (no team) are always "academy".
 */
export type TeamTone = "blue" | "orange" | "ink" | "green" | "academy" | "deep";

/** Tones a team can get, in order; "academy" is kept for academy-wide events. */
const TEAM_TONES: readonly TeamTone[] = [
  "blue",
  "orange",
  "ink",
  "green",
  "deep",
];

const HASH_MULTIPLIER = 31;
const HASH_MODULUS = 1_000_000_007;

/** A stable tone for a team id (polynomial string hash). */
export function toneForTeamId(teamId: string): TeamTone {
  let hash = 0;
  for (const char of teamId) {
    hash = (hash * HASH_MULTIPLIER + (char.codePointAt(0) ?? 0)) % HASH_MODULUS;
  }
  return TEAM_TONES[hash % TEAM_TONES.length] ?? "ink";
}

/** Filled dot / bar. */
export const TONE_BG: Record<TeamTone, string> = {
  blue: "bg-rwanda",
  orange: "bg-orange",
  ink: "bg-ink",
  green: "bg-uganda",
  academy: "bg-india",
  deep: "bg-orange-deep",
};

/** Outlined chip border (single-day non-training events). */
export const TONE_BORDER: Record<TeamTone, string> = {
  blue: "border-rwanda",
  orange: "border-orange",
  ink: "border-ink",
  green: "border-uganda",
  academy: "border-india",
  deep: "border-orange-deep",
};
