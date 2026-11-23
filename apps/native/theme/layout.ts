/**
 * Spacing, radius and sizing tokens from the Paper file.
 *
 * `space` keys follow the Paper token names (--spacing-1 = 4px, --spacing-6 =
 * 24px). Mobile artboards also use in-between values (6, 10, 14, 18, 20...):
 * write those as plain numbers where the design asks for them.
 */
export const space = {
  1: 4,
  2: 8,
  3: 12,
  4: 16,
  6: 24,
  8: 32,
  12: 48,
  16: 64,
  24: 96,
  40: 160,
} as const;

export const radius = {
  sm: 8,
  md: 16,
  lg: 24,
  xl: 40,
  full: 9999,
  /** Inputs and choice tiles on mobile. */
  field: 14,
  /** Admin stat tiles, grouped option lists. */
  tile: 18,
  /** Top corners of a bottom sheet. */
  sheet: 28,
} as const;

/** Values every mobile artboard shares. */
export const layout = {
  /** Horizontal padding of screen content. */
  screenPaddingX: 20,
  /** Default vertical gap between sections on a screen. */
  sectionGap: 20,
  /**
   * Height of the iOS status bar drawn in the Paper artboards. Used only to
   * emulate safe areas on web previews so screenshots line up with Paper.
   */
  paperStatusBarHeight: 62,
  /** Home-indicator inset of the 390×844 artboards. */
  paperHomeIndicatorInset: 34,
  /** Smallest touch target we allow (Apple HIG). */
  minTouchTarget: 44,
} as const;

/** Expands a visual size up to a 44pt touch target. */
export function hitSlopFor(size: number) {
  const pad = Math.max(0, Math.ceil((layout.minTouchTarget - size) / 2));
  return { top: pad, bottom: pad, left: pad, right: pad };
}
