import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/** Loading placeholder. Match the radius of what it stands in for (rounded-[20px] for cards). */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("animate-pulse rounded-[10px] bg-fog", className)}
      data-slot="skeleton"
      {...props}
    />
  );
}

export { Skeleton };
