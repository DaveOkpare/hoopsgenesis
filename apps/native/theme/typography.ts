import type { TextStyle } from "react-native";

import { type FontWeightName, fontFamily } from "@/theme/fonts";

/**
 * Text presets measured from the mobile artboards in Paper (size / line
 * height in px). Letter spacing tokens are in em in Paper and converted to px
 * per size here: label tracking 0.08em → 13px × 0.08 = 1.04px.
 *
 * Display presets are Anton, uppercase, with no extra tracking (the mobile
 * artboards don't apply --tracking-display). One-off sizes (60, 52, 72 ...)
 * are written as a `style` override on the closest preset.
 */
export const tracking = {
  display: -0.01,
  tight: -0.02,
  label: 0.08,
} as const;

/** Converts an em tracking token to px for a given font size. */
export function trackingPx(em: number, fontSize: number) {
  return Math.round(em * fontSize * 100) / 100;
}

interface TextPreset {
  /** Inter Tight weight used when the caller doesn't pass one. */
  defaultWeight?: FontWeightName;
  fontFamily: string;
  fontSize: number;
  letterSpacing?: number;
  lineHeight: number;
  textTransform?: TextStyle["textTransform"];
}

function display(fontSize: number, lineHeight: number): TextPreset {
  return {
    fontFamily: fontFamily.display,
    fontSize,
    lineHeight,
    textTransform: "uppercase",
  };
}

function sans(
  fontSize: number,
  lineHeight: number,
  defaultWeight: FontWeightName = "regular"
) {
  return {
    fontFamily: fontFamily.sans,
    fontSize,
    lineHeight,
    defaultWeight,
  } satisfies TextPreset;
}

export const textVariants = {
  /** 56/53 · "Hey Aline", "Check your email". */
  displayXl: display(56, 53),
  /** 48/46 · record detail title. */
  displayLg: display(48, 46),
  /** 44/42 · tab screen titles ("Fees", "Calendar", "Attendance"). */
  displayTitle: display(44, 42),
  /** 40/38 · "One quick thing before you check in"; ink-card titles use lineHeight 40. */
  displayMd: display(40, 38),
  /** 36/36 · coach session title, stat numbers. */
  displaySm: display(36, 36),
  /** 34/36 · bottom-sheet titles. */
  displayXs: display(34, 36),

  /** 11/14 · tab labels, tiny pills. */
  "2xs": sans(11, 14),
  /** 12/16 · pill labels, stat footnotes. */
  xs: sans(12, 16),
  /** 13/16 · secondary lines under a row title, captions. */
  sm: sans(13, 16),
  /** 14/18 · field labels, chips, small buttons, meta. */
  md: sans(14, 18),
  /** 15/18 · list row titles, detail rows. */
  base: sans(15, 18),
  /** 16/20 · header titles, medium buttons. */
  lg: sans(16, 20),
  /** 17/22 · large buttons. */
  xl: sans(17, 22),
  /** 16/23 (--leading-body 145%) · paragraphs. */
  paragraph: sans(16, 23),

  /** 13/16 semibold uppercase, label tracking · section headers ("Coming up"). */
  eyebrow: {
    ...sans(13, 16, "semibold"),
    letterSpacing: trackingPx(tracking.label, 13),
    textTransform: "uppercase",
  },
  /** 14/18 medium uppercase, label tracking · date line above a greeting. */
  eyebrowLg: {
    ...sans(14, 18, "medium"),
    letterSpacing: trackingPx(tracking.label, 14),
    textTransform: "uppercase",
  },
} satisfies Record<string, TextPreset>;

export type TextVariant = keyof typeof textVariants;
