import { Input as InputPrimitive } from "@base-ui/react/input";
import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/**
 * Fog field from the app screens: 46px tall (`lg`: 52px, used on sign-in).
 * A transparent 2px border turns ink on focus, so focus never shifts layout.
 */
const inputBase =
  "w-full min-w-0 rounded-[14px] border-2 border-transparent bg-fog text-ink transition-colors outline-none placeholder:text-muted focus-visible:border-ink focus-visible:bg-white disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-orange-deep aria-invalid:bg-white";

const inputSizes = {
  default: "px-[14px] py-3 text-[15px] leading-[18px]",
  lg: "px-4 py-3.5 text-base leading-5",
} as const;

function Input({
  className,
  type,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size"> & {
  size?: keyof typeof inputSizes;
}) {
  return (
    <InputPrimitive
      className={cn(inputBase, inputSizes[size], className)}
      data-slot="input"
      type={type}
      {...props}
    />
  );
}

export { Input, inputBase };
