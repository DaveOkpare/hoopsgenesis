/**
 * Colour tokens from the Paper file "Hoops Genesis — Design Language & System".
 *
 * `palette` holds the file's named tokens (--color-*). `colors` adds the
 * literal hex values the mobile artboards use outside the token set, named by
 * role, so screens never hard-code hex strings.
 */
export const palette = {
  background: "#FFFFFF",
  fog: "#F4F4F2",
  line: "#E6E6E6",
  muted: "#6B6B6B",
  ink: "#111111",
  orange: "#EB7724",
  orangeDeep: "#B8501A",
  orangeSoft: "#FDEBDD",
  white: "#FFFFFF",
  india: "#F5B900",
  rwanda: "#2BA3E1",
  uganda: "#23D27A",
  success: "#1F9D55",
} as const;

export const colors = {
  ...palette,

  /** Secondary body copy on white (notes, segmented inactive label). */
  inkSoft: "#3D3D3D",
  /** Inactive tab icon + label, struck-through titles. */
  subtle: "#8A8A8A",
  /** Placeholder text, empty radio ring, "Optional" values. */
  placeholder: "#B5B5B5",
  /** Dashed "waiting" pill border, unticked check glyph. */
  faint: "#C8C8C8",
  /** Dashed cancelled-card border, document skeleton lines. */
  stone: "#D6D6D2",
  /** Secondary segment in the coach check-in progress bar. */
  progressSecondary: "#9A9A9A",

  /** Muted text on ink cards. */
  mutedOnDark: "#BDBDBD",
  /** Footnote text on ink cards. */
  footnoteOnDark: "#8C8C8C",
  /** "Checked in 15:42" on an ink card. */
  successOnDark: "#7FD9A5",
  /** Outline button border on ink. */
  lineOnDark: "#3A3A3A",
  /** Translucent white fill on dark/colour screens (scanner controls, success details). */
  glass: "#FFFFFF24",
  /** Hairline on a glass panel. */
  glassLine: "#FFFFFF2E",
  /** QR scanner background. */
  scanner: "#1C1C1C",

  successSoft: "#E3F5EA",

  /** Sheet scrim over light screens. */
  scrim: "#11111166",
  /** Sheet scrim over the dark scanner. */
  scrimDark: "#00000080",
} as const;

/** Pastel fills the coach roster uses behind initials (cycled by person). */
export const avatarTints = ["#D9E8F2", "#F2E4D9", "#E0E8D9"] as const;

export type ColorName = keyof typeof colors;
