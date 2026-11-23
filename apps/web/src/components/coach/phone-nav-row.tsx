import { cn } from "@hoops-genesis/ui/lib/utils";
import type { ReactNode } from "react";

/** 36px fog circle used for back / close / more on the coach phone screens. */
export const circleButtonClass =
  "flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-fog text-ink outline-none transition-colors hover:bg-stone/60 focus-visible:ring-2 focus-visible:ring-ink";

/**
 * Top row of the phone task screens: leading circle, centred title or badge, trailing
 * circle (or an empty 36px slot so the centre stays centred). Phone only.
 */
export function PhoneNavRow({
  leading,
  center,
  trailing,
  className,
}: {
  leading: ReactNode;
  center: ReactNode;
  trailing?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn("flex items-center justify-between md:hidden", className)}
    >
      {leading}
      {center}
      {trailing ?? <span aria-hidden="true" className="size-9 shrink-0" />}
    </div>
  );
}

/** Centred 16/600 title in the phone nav row ("New event", "Log a result"). */
export function PhoneNavTitle({ children }: { children: ReactNode }) {
  return (
    <h1 className="font-semibold text-base text-ink leading-5">{children}</h1>
  );
}
