import {
  Text as RNText,
  type TextProps as RNTextProps,
  StyleSheet,
} from "react-native";

import { type ColorName, colors } from "@/theme/colors";
import {
  type FontWeightName,
  fontFamily,
  sansFamilyByWeight,
} from "@/theme/fonts";
import { type TextVariant, textVariants } from "@/theme/typography";

export interface TextProps extends RNTextProps {
  align?: "left" | "center" | "right";
  /** A theme colour name or any colour string. Defaults to ink. */
  color?: ColorName | (string & {});
  /** Size/line-height preset. Defaults to `base` (15/18). */
  variant?: TextVariant;
  /** Inter Tight weight. Ignored for display (Anton) variants. */
  weight?: FontWeightName;
}

function resolveColor(color: TextProps["color"]) {
  if (color === undefined) {
    return colors.ink;
  }
  return color in colors ? colors[color as ColorName] : color;
}

/**
 * The only text component screens should use. Pick a `variant` for size and
 * line height, then `weight` and `color`. One-off sizes go in `style`.
 *
 * Every <Text> applies its own variant (default `base`), so for inline
 * emphasis repeat the parent's variant on the nested one:
 * `<Text variant="md">Reason <Text variant="md" color="muted">(students see this)</Text></Text>`.
 */
export function Text({
  variant = "base",
  weight,
  color,
  align,
  style,
  ...rest
}: TextProps) {
  const preset = textVariants[variant];
  const isDisplay = preset.fontFamily === fontFamily.display;
  const family = isDisplay
    ? preset.fontFamily
    : sansFamilyByWeight[
        weight ?? ("defaultWeight" in preset ? preset.defaultWeight : "regular")
      ];

  return (
    <RNText
      {...rest}
      style={[
        styles.reset,
        {
          fontFamily: family,
          fontSize: preset.fontSize,
          lineHeight: preset.lineHeight,
          letterSpacing: "letterSpacing" in preset ? preset.letterSpacing : 0,
          textTransform:
            "textTransform" in preset ? preset.textTransform : "none",
          color: resolveColor(color),
          textAlign: align,
        },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  reset: {
    // Android adds font padding that throws line heights off the design.
    includeFontPadding: false,
  },
});
