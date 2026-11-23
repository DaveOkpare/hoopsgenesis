import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "field-sizing-content flex min-h-[84px] w-full resize-none rounded-[14px] border-2 border-transparent bg-fog px-3 py-2.5 text-[15px] text-ink leading-body outline-none transition-colors placeholder:text-muted focus-visible:border-ink focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-orange-deep aria-invalid:bg-white",
        className
      )}
      data-slot="textarea"
      {...props}
    />
  );
}

export { Textarea };
