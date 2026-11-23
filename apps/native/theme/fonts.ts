import { Anton_400Regular } from "@expo-google-fonts/anton/400Regular";
import { IBMPlexMono_400Regular } from "@expo-google-fonts/ibm-plex-mono/400Regular";
import { InterTight_400Regular } from "@expo-google-fonts/inter-tight/400Regular";
import { InterTight_500Medium } from "@expo-google-fonts/inter-tight/500Medium";
import { InterTight_600SemiBold } from "@expo-google-fonts/inter-tight/600SemiBold";
import { InterTight_700Bold } from "@expo-google-fonts/inter-tight/700Bold";

/**
 * Font family names as registered with expo-font. React Native needs one
 * family per weight, so always pick the family from here instead of setting
 * `fontWeight` (which Android would fake-bold).
 */
export const fontFamily = {
  display: "Anton_400Regular",
  sans: "InterTight_400Regular",
  sansMedium: "InterTight_500Medium",
  sansSemibold: "InterTight_600SemiBold",
  sansBold: "InterTight_700Bold",
  mono: "IBMPlexMono_400Regular",
} as const;

/** Passed to `useFonts` in the root layout. Only the weights the designs use. */
export const fontAssets = {
  [fontFamily.display]: Anton_400Regular,
  [fontFamily.sans]: InterTight_400Regular,
  [fontFamily.sansMedium]: InterTight_500Medium,
  [fontFamily.sansSemibold]: InterTight_600SemiBold,
  [fontFamily.sansBold]: InterTight_700Bold,
  [fontFamily.mono]: IBMPlexMono_400Regular,
};

export type FontWeightName = "regular" | "medium" | "semibold" | "bold";

export const sansFamilyByWeight: Record<FontWeightName, string> = {
  regular: fontFamily.sans,
  medium: fontFamily.sansMedium,
  semibold: fontFamily.sansSemibold,
  bold: fontFamily.sansBold,
};
