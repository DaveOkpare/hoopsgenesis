import { cn } from "@hoops-genesis/ui/lib/utils";

/*
 * The "HG" tile. Sizes match Paper: 26 (round, phone academy chip), 32 (switcher list),
 * 36 (sidebar), 44 (sign-in brand panel), 56 (phone sign-in).
 * tone="orange" is the active/own academy; tone="ink" is any other academy.
 */
const sizes = {
  26: "size-[26px] rounded-full text-[11px] leading-[14px]",
  32: "size-8 rounded-[9px] text-sm leading-[18px]",
  36: "size-9 rounded-[10px] text-base leading-5",
  44: "size-11 rounded-[12px] text-[20px] leading-6",
  56: "size-14 rounded-[14px] text-[24px] leading-7",
} as const;

export function BrandMark({
  size = 36,
  tone = "orange",
  className,
}: {
  size?: keyof typeof sizes;
  tone?: "orange" | "ink";
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex shrink-0 items-center justify-center font-display",
        sizes[size],
        tone === "orange" ? "bg-orange text-ink" : "bg-ink text-white",
        className
      )}
    >
      HG
    </span>
  );
}
