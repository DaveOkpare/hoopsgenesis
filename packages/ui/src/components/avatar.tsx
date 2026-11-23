"use client";

import { Avatar as AvatarPrimitive } from "@base-ui/react/avatar";
import { cn } from "@hoops-genesis/ui/lib/utils";

/**
 * Initials circle. Sizes are the pixel sizes used in Paper:
 * 26 (mobile academy chip), 28 (dialog picker), 30 (activity log), 32 (table rows),
 * 34 (sidebar user), 36 (member rows, mobile lists), 44 (search results), 52 (detail).
 * Tones: fog (default, on white), ink (sidebar user), white (on fog or ink),
 * placeholder (dashed "?" for pending invites).
 */
const sizes = {
  26: "size-[26px] text-[11px]",
  28: "size-[28px] text-[11px]",
  30: "size-[30px] text-[12px]",
  32: "size-8 text-[12px]",
  34: "size-[34px] text-[13px]",
  36: "size-9 text-[13px]",
  44: "size-11 text-[15px]",
  52: "size-[52px] text-[17px]",
} as const;

const tones = {
  fog: "bg-fog text-ink",
  ink: "bg-ink text-white",
  white: "bg-white text-ink",
  placeholder:
    "border-[#c8c8c8] border-[1.5px] border-dashed bg-white text-muted",
} as const;

type AvatarSize = keyof typeof sizes;
type AvatarTone = keyof typeof tones;

function Avatar({
  className,
  size = 32,
  tone = "fog",
  ...props
}: AvatarPrimitive.Root.Props & { size?: AvatarSize; tone?: AvatarTone }) {
  return (
    <AvatarPrimitive.Root
      className={cn(
        "relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-sans font-semibold leading-4",
        sizes[size],
        tones[tone],
        className
      )}
      data-slot="avatar"
      {...props}
    />
  );
}

function AvatarImage({ className, ...props }: AvatarPrimitive.Image.Props) {
  return (
    <AvatarPrimitive.Image
      className={cn("aspect-square size-full object-cover", className)}
      data-slot="avatar-image"
      {...props}
    />
  );
}

function AvatarFallback({
  className,
  ...props
}: AvatarPrimitive.Fallback.Props) {
  return (
    <AvatarPrimitive.Fallback
      className={cn("flex size-full items-center justify-center", className)}
      data-slot="avatar-fallback"
      {...props}
    />
  );
}

export type { AvatarSize, AvatarTone };
export { Avatar, AvatarFallback, AvatarImage };
