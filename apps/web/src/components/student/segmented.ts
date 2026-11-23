/*
 * Fog segmented switch from the student artboards: "Agenda | Month" (49N-0, small) and
 * "Attendance | Results" (46Z-0 / 47V-0, full width). Items are links; the current one
 * gets aria-current and the white raised pill.
 */
import { cn } from "@hoops-genesis/ui/lib/utils";

export function segmentedTrack(size: "sm" | "default"): string {
  return cn(
    "flex rounded-full bg-fog",
    size === "sm" ? "gap-[2px] p-[3px]" : "gap-1 p-1"
  );
}

export function segmentedItem(size: "sm" | "default", active: boolean): string {
  return cn(
    "flex items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ink",
    size === "sm"
      ? "px-3 py-[7px] text-[13px] leading-4"
      : "flex-1 basis-0 py-[9px] text-sm leading-[18px]",
    active
      ? "bg-white font-semibold text-ink shadow-[0_1px_2px_#1111110f]"
      : "font-medium text-ink-soft hover:text-ink"
  );
}
