"use client";

import { Tabs as TabsPrimitive } from "@base-ui/react/tabs";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Segmented pill tabs (Members "All 48 · Students 40 …", Fees "Payments · Unpaid 14",
 * Records "Pending 5 · Verified · Rejected"). Below md the list stretches full width
 * with equal-width tabs, as on the phone designs.
 */

function Tabs({ className, ...props }: TabsPrimitive.Root.Props) {
  return (
    <TabsPrimitive.Root
      className={cn("flex flex-col gap-4", className)}
      data-slot="tabs"
      {...props}
    />
  );
}

function TabsList({ className, ...props }: TabsPrimitive.List.Props) {
  return (
    <TabsPrimitive.List
      className={cn(
        "inline-flex w-fit items-center gap-1 rounded-full bg-fog p-1 max-md:flex max-md:w-full",
        className
      )}
      data-slot="tabs-list"
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: TabsPrimitive.Tab.Props) {
  return (
    <TabsPrimitive.Tab
      className={cn(
        "inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap rounded-full px-4 py-[9px] font-medium text-ink-soft text-sm leading-[18px] outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-ink disabled:pointer-events-none disabled:opacity-50 data-active:bg-white data-active:font-semibold data-active:text-ink data-active:shadow-[0_1px_2px_#1111110f] max-md:flex-1",
        className
      )}
      data-slot="tabs-trigger"
      {...props}
    />
  );
}

/** Count inside a tab: muted by default, orange-deep for things needing action. */
function TabsCount({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "alert" }) {
  return (
    <span
      className={cn(
        tone === "alert"
          ? "font-semibold text-orange-deep"
          : "font-medium text-muted",
        className
      )}
      data-slot="tabs-count"
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: TabsPrimitive.Panel.Props) {
  return (
    <TabsPrimitive.Panel
      className={cn("outline-none", className)}
      data-slot="tabs-content"
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsCount, TabsList, TabsTrigger };
