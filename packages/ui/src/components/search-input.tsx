import { cn } from "@hoops-genesis/ui/lib/utils";
import type * as React from "react";

/*
 * Outline pill search field ("Search name or email", "Search the team").
 * size="lg" is the big focused search on the owner Users screen.
 * <SearchInput aria-label="Search members" placeholder="Search name or email" />
 */
function SearchInput({
  className,
  size = "default",
  ...props
}: Omit<React.ComponentProps<"input">, "size" | "type"> & {
  size?: "default" | "lg";
}) {
  return (
    <label
      className={cn(
        "flex w-full min-w-0 cursor-text items-center rounded-full border border-line bg-white text-ink transition-colors focus-within:border-ink",
        size === "default" &&
          "gap-2 px-[14px] py-[10px] text-sm leading-[18px]",
        size === "lg" &&
          "gap-3 rounded-[18px] border-2 px-5 py-4 text-[17px] leading-[22px]",
        className
      )}
      data-slot="search-input"
    >
      <svg
        aria-hidden="true"
        className={cn("shrink-0 text-muted", size === "lg" && "text-ink")}
        height={size === "lg" ? 18 : 16}
        viewBox="0 0 16 16"
        width={size === "lg" ? 18 : 16}
      >
        <circle
          cx="7"
          cy="7"
          fill="none"
          r="4.8"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        <path
          d="M10.6 10.6L14 14"
          fill="none"
          stroke="currentColor"
          strokeLinecap="round"
          strokeWidth="1.6"
        />
      </svg>
      <input
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted"
        type="search"
        {...props}
      />
    </label>
  );
}

export { SearchInput };
