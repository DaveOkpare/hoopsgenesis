"use client";

import { Toggle as TogglePrimitive } from "@base-ui/react/toggle";
import { ToggleGroup as ToggleGroupPrimitive } from "@base-ui/react/toggle-group";
import { cn } from "@hoops-genesis/ui/lib/utils";

/*
 * Single-choice control for form values ("Method: Cash · Bank transfer · Mobile money",
 * "Role: Student · Coach").
 * md and up: fog segmented pill (web Record payment).
 * Below md: separate 14px-radius boxes, selected = 2px ink border (phone Record payment).
 *
 * <ToggleGroup value={[method]} onValueChange={([v]) => v && setMethod(v)} aria-label="Method">
 *   <ToggleGroupItem value="cash">Cash</ToggleGroupItem>
 * </ToggleGroup>
 */

function ToggleGroup({ className, ...props }: ToggleGroupPrimitive.Props) {
  return (
    <ToggleGroupPrimitive
      className={cn(
        "flex w-full gap-1 rounded-full bg-fog p-1 max-md:gap-2 max-md:rounded-none max-md:bg-transparent max-md:p-0",
        className
      )}
      data-slot="toggle-group"
      {...props}
    />
  );
}

function ToggleGroupItem({ className, ...props }: TogglePrimitive.Props) {
  return (
    <TogglePrimitive
      className={cn(
        "flex flex-1 basis-0 cursor-pointer items-center justify-center rounded-full py-[10px] font-medium text-ink-soft text-sm leading-[18px] outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50 data-pressed:bg-white data-pressed:font-semibold data-pressed:text-ink data-pressed:shadow-[0_1px_2px_#1111110f]",
        "max-md:rounded-[14px] max-md:border max-md:border-line max-md:p-[11px] max-md:text-[15px] max-md:text-ink max-md:leading-5 max-md:data-pressed:border-2 max-md:data-pressed:border-ink max-md:data-pressed:p-[10px] max-md:data-pressed:shadow-none",
        className
      )}
      data-slot="toggle-group-item"
      {...props}
    />
  );
}

export { ToggleGroup, ToggleGroupItem };
