import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/**
 * Field label: 14/600 ink.
 * Hints go inline: <Label>Team <LabelHint>(optional)</LabelHint></Label>
 */
function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: callers pass htmlFor or wrap the control.
    <label
      className={cn(
        "flex select-none items-center gap-1 font-semibold text-ink text-sm leading-[18px] peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className
      )}
      data-slot="label"
      {...props}
    />
  );
}

function LabelHint({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"span"> & { tone?: "muted" | "required" }) {
  return (
    <span
      className={cn(
        "font-regular",
        tone === "required" ? "text-orange-deep" : "text-muted",
        className
      )}
      {...props}
    />
  );
}

/** Label + control stacked with the 8px gap used in every form. */
function Field({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-col gap-2", className)}
      data-slot="field"
      {...props}
    />
  );
}

/** Helper or error text under a field. */
function FieldMessage({
  className,
  tone = "muted",
  ...props
}: React.ComponentProps<"p"> & { tone?: "muted" | "error" }) {
  return (
    <p
      className={cn(
        "text-[13px] leading-4",
        tone === "error" ? "text-orange-deep" : "text-muted",
        className
      )}
      {...props}
    />
  );
}

export { Field, FieldMessage, Label, LabelHint };
