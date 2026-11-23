"use client";

import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox";
import { cn } from "@hoops-genesis/ui/lib/utils";

/** 22px rounded square; checked = ink fill with a white tick (Void payment dialog). */
function Checkbox({ className, ...props }: CheckboxPrimitive.Root.Props) {
  return (
    <CheckboxPrimitive.Root
      className={cn(
        "peer relative flex size-[22px] shrink-0 cursor-pointer items-center justify-center rounded-[6px] border-[#c8c8c8] border-[1.5px] bg-white text-white outline-none transition-colors after:absolute after:-inset-2 focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-orange-deep data-checked:border-ink data-checked:bg-ink",
        className
      )}
      data-slot="checkbox"
      {...props}
    >
      <CheckboxPrimitive.Indicator
        className="grid place-content-center"
        data-slot="checkbox-indicator"
      >
        <svg aria-hidden="true" height="12" viewBox="0 0 12 12" width="12">
          <path
            d="M2.5 6.2l2.2 2.2L9.5 3.6"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.7"
          />
        </svg>
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
